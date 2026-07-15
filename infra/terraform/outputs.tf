output "backend_ecr_repository_url" {
  description = "Push the backend image here (CI builds and tags it)."
  value       = aws_ecr_repository.backend.repository_url
}

output "cloudfront_domain_name" {
  description = "Public entry point for buyers."
  value       = aws_cloudfront_distribution.main.domain_name
}

output "alb_dns_name" {
  description = "Internal API load balancer hostname."
  value       = aws_lb.api.dns_name
}

output "redis_primary_endpoint" {
  description = "ElastiCache primary endpoint used as REDIS_URL."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "orders_queue_url" {
  description = "SQS queue that receives order events."
  value       = aws_sqs_queue.orders.url
}

output "frontend_bucket" {
  description = "S3 bucket the built React bundle is synced to."
  value       = aws_s3_bucket.frontend.bucket
}
