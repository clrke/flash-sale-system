variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "ap-southeast-2" # Sydney, closest to Bookipi HQ.
}

variable "project" {
  description = "Project name, used as a resource name prefix."
  type        = string
  default     = "flash-sale"
}

variable "environment" {
  description = "Deployment environment (for example prod, staging)."
  type        = string
  default     = "prod"
}

# Networking is assumed to exist (a shared VPC). This skeleton consumes it via
# variables rather than provisioning a VPC, to stay focused on the application
# topology.
variable "vpc_id" {
  description = "VPC to deploy the load balancer, tasks, and cache into."
  type        = string
  default     = "vpc-REPLACE_ME"
}

variable "public_subnet_ids" {
  description = "Public subnets for the Application Load Balancer."
  type        = list(string)
  default     = ["subnet-REPLACE_ME_A", "subnet-REPLACE_ME_B"]
}

variable "private_subnet_ids" {
  description = "Private subnets for the Fargate tasks and ElastiCache."
  type        = list(string)
  default     = ["subnet-REPLACE_ME_C", "subnet-REPLACE_ME_D"]
}

variable "backend_image" {
  description = "Full ECR image reference for the backend container."
  type        = string
  default     = "REPLACE_ME.dkr.ecr.ap-southeast-2.amazonaws.com/flash-sale-backend:latest"
}

variable "api_desired_count" {
  description = "Baseline number of Fargate tasks (scales up under load)."
  type        = number
  default     = 2
}

variable "api_cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Fargate task memory (MiB)."
  type        = number
  default     = 1024
}

variable "redis_node_type" {
  description = "ElastiCache node type for the inventory core."
  type        = string
  default     = "cache.t4g.small"
}

variable "total_stock" {
  description = "Units available in the sale."
  type        = number
  default     = 200
}

variable "lambda_zip_path" {
  description = "Path to the built order-consumer Lambda artifact. The function code is not part of this skeleton."
  type        = string
  default     = "lambda/order-consumer.zip"
}
