# --- what already exists -----------------------------------------------------------
# Read, not managed. The environment is already on Stream Governance Essentials, which
# is where it stays: upgrading to Advanced cannot be reversed, and the only way back is
# to delete the environment. Nothing here sets the package at all.

data "confluent_environment" "demo" {
  id = var.environment_id
}

data "confluent_kafka_cluster" "demo" {
  id = var.cluster_id

  environment {
    id = data.confluent_environment.demo.id
  }
}

# Provisioned automatically with the environment, so a data source rather than a resource.
data "confluent_schema_registry_cluster" "demo" {
  environment {
    id = data.confluent_environment.demo.id
  }
}

# --- identities --------------------------------------------------------------------
# Three principals, so that no single credential does everything. The reader is the only
# one the frontend ever holds.

resource "confluent_service_account" "manager" {
  display_name = "${var.prefix}-manager"
  description  = "Provisions topics, schemas and Flink statements for the demo."
}

resource "confluent_service_account" "producer" {
  display_name = "${var.prefix}-producer"
  description  = "Writes the raw topics: the generators and the narrative events."
}

resource "confluent_service_account" "reader" {
  display_name = "${var.prefix}-reader"
  description  = "Queries the served Lightning Tables. Held by the frontend only."
}

resource "confluent_role_binding" "manager_env_admin" {
  principal   = "User:${confluent_service_account.manager.id}"
  role_name   = "EnvironmentAdmin"
  crn_pattern = data.confluent_environment.demo.resource_name
}

resource "confluent_role_binding" "producer_write" {
  principal   = "User:${confluent_service_account.producer.id}"
  role_name   = "DeveloperWrite"
  crn_pattern = "${data.confluent_kafka_cluster.demo.rbac_crn}/kafka=${data.confluent_kafka_cluster.demo.id}/topic=*"
}

# A Lightning Table query needs read on BOTH the topic and the Schema Registry subject:
# topic scope alone grants the query but not the metadata, and subject scope alone grants
# the reverse.
#
# Both of these must name a resource. A bare cluster CRN is refused with "Resources must
# be specified for role DeveloperRead", and Schema Registry has no cluster-level
# DeveloperRead at all ("No role DeveloperRead for resource type SchemaRegistry"). So the
# patterns end in topic=* and subject=*, which is also what Confluent's own quickstart
# grants its reader.
resource "confluent_role_binding" "reader_topic_read" {
  principal   = "User:${confluent_service_account.reader.id}"
  role_name   = "DeveloperRead"
  crn_pattern = "${data.confluent_kafka_cluster.demo.rbac_crn}/kafka=${data.confluent_kafka_cluster.demo.id}/topic=*"
}

resource "confluent_role_binding" "reader_subject_read" {
  principal   = "User:${confluent_service_account.reader.id}"
  role_name   = "DeveloperRead"
  crn_pattern = "${data.confluent_schema_registry_cluster.demo.resource_name}/subject=*"
}

# --- keys --------------------------------------------------------------------------
# Note what is missing: querying a Lightning Table needs a *Global* API key, and the
# provider cannot express that scope. One CLI line mints it. See scripts/global-key.sh.

resource "confluent_api_key" "manager_kafka" {
  display_name = "${var.prefix}-manager-kafka"
  description  = "Kafka admin key for the demo manager."

  owner {
    id          = confluent_service_account.manager.id
    api_version = confluent_service_account.manager.api_version
    kind        = confluent_service_account.manager.kind
  }

  managed_resource {
    id          = data.confluent_kafka_cluster.demo.id
    api_version = data.confluent_kafka_cluster.demo.api_version
    kind        = data.confluent_kafka_cluster.demo.kind

    environment {
      id = data.confluent_environment.demo.id
    }
  }

  depends_on = [confluent_role_binding.manager_env_admin]
}

resource "confluent_api_key" "producer_kafka" {
  display_name = "${var.prefix}-producer-kafka"
  description  = "Produces to the raw topics over the Kafka REST API."

  owner {
    id          = confluent_service_account.producer.id
    api_version = confluent_service_account.producer.api_version
    kind        = confluent_service_account.producer.kind
  }

  managed_resource {
    id          = data.confluent_kafka_cluster.demo.id
    api_version = data.confluent_kafka_cluster.demo.api_version
    kind        = data.confluent_kafka_cluster.demo.kind

    environment {
      id = data.confluent_environment.demo.id
    }
  }

  depends_on = [confluent_role_binding.producer_write]
}

resource "confluent_api_key" "manager_sr" {
  display_name = "${var.prefix}-manager-sr"
  description  = "Registers schemas for the demo."

  owner {
    id          = confluent_service_account.manager.id
    api_version = confluent_service_account.manager.api_version
    kind        = confluent_service_account.manager.kind
  }

  managed_resource {
    id          = data.confluent_schema_registry_cluster.demo.id
    api_version = data.confluent_schema_registry_cluster.demo.api_version
    kind        = data.confluent_schema_registry_cluster.demo.kind

    environment {
      id = data.confluent_environment.demo.id
    }
  }

  depends_on = [confluent_role_binding.manager_env_admin]
}

# --- flink -------------------------------------------------------------------------
# An idle pool costs nothing unless a statement sets a baseline CFU; statements bill per
# minute while they run. max_cfu is the spend ceiling, not a performance setting.
resource "confluent_flink_compute_pool" "demo" {
  display_name = "${var.prefix}-pool"
  cloud        = "AWS"
  region       = var.region
  max_cfu      = var.flink_max_cfu

  environment {
    id = data.confluent_environment.demo.id
  }
}
