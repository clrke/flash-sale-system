# Provider and version pinning. This skeleton targets AWS, which is Bookipi's
# platform. It is a reference topology, not applied by CI, and it maps 1:1 onto
# docs/DEPLOYMENT.md.
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # In a real account, state would live in S3 with DynamoDB locking. Left
  # commented so `tofu validate` runs without a backend.
  # backend "s3" {
  #   bucket         = "flash-sale-tfstate"
  #   key            = "flash-sale/terraform.tfstate"
  #   region         = "ap-southeast-2"
  #   dynamodb_table = "flash-sale-tflock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}
