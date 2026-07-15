# Terraform: reference AWS topology

A not-applied reference that expresses the production architecture in
[docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) as infrastructure as code. It is
here to show the shape of a real deployment, not to be run by CI or graders.

## What it provisions

- **ECR** repository for the backend image.
- **ElastiCache for Redis** (Multi-AZ replication group, automatic failover, AOF
  enabled) as the single atomic inventory core.
- **ALB + ECS Fargate** service running the stateless Fastify API, with
  target-tracking autoscaling on CPU and ALB request count.
- **S3 + CloudFront** for the React bundle, with `/api/*` forwarded to the ALB.
- **SQS (plus a dead-letter queue) + Lambda + DynamoDB** for durable order
  persistence off the hot path.
- **CloudWatch alarms** on API 5xx and dead-letter-queue depth, wired to SNS.
- Least-privilege **IAM** roles for the tasks and the order-consumer Lambda.

## Scope and simplifications

- **Networking is consumed, not created.** A shared VPC and subnets are passed in
  as variables. A standalone deployment would add a VPC module.
- **The Lambda function code is not included.** `aws_lambda_function` points at a
  placeholder artifact path; the consumer would be built and packaged separately.
- **TLS and WAF** are noted where they attach (ALB listener certificate,
  CloudFront web ACL) but left to per-environment configuration.

## Usage

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # then edit
tofu init
tofu validate
tofu plan
```

`terraform` and `tofu` are interchangeable here.
