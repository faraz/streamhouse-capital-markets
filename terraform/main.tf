# The demo's own environment. Separate so that `terraform destroy` ends every meter, and
# so Stream Governance stays Essentials here no matter what else the org does.
#
# Essentials is deliberate, not a default: upgrading to Advanced cannot be undone. Per
# Confluent, "it is not possible to downgrade from Advanced to Essentials. The only
# option is to delete the environment, and start over."
resource "confluent_environment" "demo" {
  display_name = var.prefix

  stream_governance {
    package = "ESSENTIALS"
  }
}

# Basic qualifies for Lightning Tables, and its first eCKU is free.
resource "confluent_kafka_cluster" "demo" {
  display_name = "${var.prefix}-cluster"
  availability = "SINGLE_ZONE"
  cloud        = "AWS"
  region       = var.region

  basic {}

  environment {
    id = confluent_environment.demo.id
  }
}

data "confluent_schema_registry_cluster" "demo" {
  environment {
    id = confluent_environment.demo.id
  }

  depends_on = [confluent_kafka_cluster.demo]
}

# --- identities -------------------------------------------------------------------
# Three principals, so no one credential does everything.
#
#   manager  provisions topics and schemas, and runs Flink
#   producer writes the raw topics (Datagen, and the Worker's narrative events)
#   reader   is the only credential the frontend holds

resource "confluent_service_account" "manager" {
  display_name = "${var.prefix}-manager"
  description  = "Provisions topics, schemas and Flink statements for the demo."
}

resource "confluent_service_account" "producer" {
  display_name = "${var.prefix}-producer"
  description  = "Writes the raw topics. Held by the generators and the Worker."
}

resource "confluent_service_account" "reader" {
  display_name = "${var.prefix}-reader"
  description  = "Queries the served Lightning Tables. Held by the frontend only."
}

resource "confluent_role_binding" "manager_env_admin" {
  principal   = "User:${confluent_service_account.manager.id}"
  role_name   = "EnvironmentAdmin"
  crn_pattern = confluent_environment.demo.resource_name
}

resource "confluent_role_binding" "producer_write" {
  principal   = "User:${confluent_service_account.producer.id}"
  role_name   = "DeveloperWrite"
  crn_pattern = "${confluent_kafka_cluster.demo.rbac_crn}/kafka=${confluent_kafka_cluster.demo.id}/topic=*"
}

# A Lightning Table query needs read on BOTH the topic and the Schema Registry cluster:
# topic scope alone grants query but not metadata, and SR scope alone the reverse. A
# cluster-scope binding covers both in one.
resource "confluent_role_binding" "reader_cluster_read" {
  principal   = "User:${confluent_service_account.reader.id}"
  role_name   = "DeveloperRead"
  crn_pattern = confluent_kafka_cluster.demo.rbac_crn
}

resource "confluent_role_binding" "reader_sr_read" {
  principal   = "User:${confluent_service_account.reader.id}"
  role_name   = "DeveloperRead"
  crn_pattern = data.confluent_schema_registry_cluster.demo.resource_name
}

# --- keys -------------------------------------------------------------------------

resource "confluent_api_key" "manager_kafka" {
  display_name = "${var.prefix}-manager-kafka"
  description  = "Kafka admin key for the demo manager."

  owner {
    id          = confluent_service_account.manager.id
    api_version = confluent_service_account.manager.api_version
    kind        = confluent_service_account.manager.kind
  }

  managed_resource {
    id          = confluent_kafka_cluster.demo.id
    api_version = confluent_kafka_cluster.demo.api_version
    kind        = confluent_kafka_cluster.demo.kind

    environment {
      id = confluent_environment.demo.id
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
    id          = confluent_kafka_cluster.demo.id
    api_version = confluent_kafka_cluster.demo.api_version
    kind        = confluent_kafka_cluster.demo.kind

    environment {
      id = confluent_environment.demo.id
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
      id = confluent_environment.demo.id
    }
  }

  depends_on = [confluent_role_binding.manager_env_admin]
}

# --- flink ------------------------------------------------------------------------
# CFUs bill per minute only while a statement runs, and an idle pool costs nothing
# unless a statement sets a baseline CFU. max_cfu caps the hourly spend.
resource "confluent_flink_compute_pool" "demo" {
  display_name = "${var.prefix}-pool"
  cloud        = "AWS"
  region       = var.region
  max_cfu      = 10

  environment {
    id = confluent_environment.demo.id
  }
}
