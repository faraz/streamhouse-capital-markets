variable "prefix" {
  description = "Prefix for every display name, so two people can run this in one org."
  type        = string
  default     = "streamhouse-cm"
}

variable "region" {
  description = "AWS region. Lightning Tables are AWS-only and supported in 10 regions."
  type        = string
  default     = "us-east-1"

  validation {
    condition = contains([
      "us-east-1", "us-east-2", "us-west-2",
      "ap-northeast-2", "ap-southeast-2", "ap-south-1", "ap-southeast-1",
      "eu-central-1", "eu-west-1", "eu-west-2",
    ], var.region)
    error_message = "Lightning Tables are not available in that region."
  }
}

variable "client_count" {
  description = "How many clients the generators produce. The deck's figure is 4,000."
  type        = number
  default     = 4000
}

variable "enable_tableflow" {
  description = "Clock three. Off by default because it bills per topic-hour."
  type        = bool
  default     = false
}

variable "enable_streaming_agent" {
  description = "The Flink agent that writes escalations. Needs Flink Native Inference."
  type        = bool
  default     = false
}
