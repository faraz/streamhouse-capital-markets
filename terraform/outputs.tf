output "environment_id" {
  value = data.confluent_environment.demo.id
}

output "cluster_id" {
  value = data.confluent_kafka_cluster.demo.id
}

output "cluster_rest_endpoint" {
  description = "Where narrative events are produced, over the Kafka REST API."
  value       = data.confluent_kafka_cluster.demo.rest_endpoint
}

output "cluster_bootstrap_endpoint" {
  value = data.confluent_kafka_cluster.demo.bootstrap_endpoint
}

output "schema_registry_endpoint" {
  value = data.confluent_schema_registry_cluster.demo.rest_endpoint
}

output "flink_compute_pool_id" {
  value = confluent_flink_compute_pool.demo.id
}

output "producer_key" {
  description = "For the generators and the Worker's produce routes."
  value       = confluent_api_key.producer_kafka.id
}

output "producer_secret" {
  value     = confluent_api_key.producer_kafka.secret
  sensitive = true
}

output "manager_sr_key" {
  value = confluent_api_key.manager_sr.id
}

output "manager_sr_secret" {
  value     = confluent_api_key.manager_sr.secret
  sensitive = true
}

output "reader_service_account_id" {
  description = "The principal the Global API key for querying should belong to."
  value       = confluent_service_account.reader.id
}
