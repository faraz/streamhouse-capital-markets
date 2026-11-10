variable "prefix" {
  description = "Prefix for every display name the demo creates."
  type        = string
  default     = "streamhouse-cm"
}

# The environment and cluster already existed, created by hand. Terraform reads them
# rather than owning them, so a destroy never takes the cluster with it.
variable "environment_id" {
  description = "The pre-existing Capital-Markets environment."
  type        = string
  default     = "env-53k1pn"
}

variable "cluster_id" {
  description = "The pre-existing brokerage_0 cluster. Standard, AWS, us-east-1."
  type        = string
  default     = "lkc-v7wpq15"
}

variable "region" {
  description = "Must match the cluster's region. Lightning Tables are AWS-only."
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

variable "source_count" {
  description = "How many raw sources to provision. Three for a rehearsal, six for the talk."
  type        = number
  default     = 3

  validation {
    condition     = var.source_count >= 1 && var.source_count <= 6
    error_message = "There are six raw sources."
  }
}

variable "client_count" {
  description = "How many clients the generators cover. The deck's figure is 4,000."
  type        = number
  default     = 4000
}

variable "enable_tableflow" {
  description = "Clock three. Off by default: it bills per topic-hour."
  type        = bool
  default     = false
}

variable "enable_streaming_agent" {
  description = "The Flink agent that writes escalations."
  type        = bool
  default     = false
}

variable "flink_max_cfu" {
  description = "Caps the hourly Flink spend. CFUs bill per minute while statements run."
  type        = number
  default     = 10
}
