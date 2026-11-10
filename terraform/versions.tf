terraform {
  required_version = ">= 1.9"
  required_providers {
    confluent = {
      source = "confluentinc/confluent"
      # 2.94.0 (2026-11-06) is the first release after the Lightning Tables rename.
      # confluent_rtce_topic itself landed in 2.73.0 and is badged GA.
      version = "~> 2.94"
    }
  }
}

provider "confluent" {
  # From CONFLUENT_CLOUD_API_KEY / CONFLUENT_CLOUD_API_SECRET in the environment.
  # A Cloud API key manages resources; querying a Lightning Table needs a Global key,
  # which the provider cannot mint. See scripts/global-key.sh.
}
