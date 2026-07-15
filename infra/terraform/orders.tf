# Durable order persistence, off the hot path. A successful purchase publishes
# an event to SQS; a Lambda consumer writes the durable order to DynamoDB and
# retries, sending poison messages to a dead-letter queue. The sale never blocks
# on this path. The Lambda function code is not part of this skeleton.

resource "aws_sqs_queue" "orders_dlq" {
  name                      = "${local.name_prefix}-orders-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "orders" {
  name                       = "${local.name_prefix}-orders"
  visibility_timeout_seconds = 60

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.orders_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_dynamodb_table" "orders" {
  name         = "${local.name_prefix}-orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_cloudwatch_log_group" "order_consumer" {
  name              = "/aws/lambda/${local.name_prefix}-order-consumer"
  retention_in_days = 30
}

resource "aws_lambda_function" "order_consumer" {
  function_name = "${local.name_prefix}-order-consumer"
  role          = aws_iam_role.order_consumer.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"

  # The build artifact is produced separately; this path is a placeholder.
  filename = var.lambda_zip_path

  environment {
    variables = {
      ORDERS_TABLE = aws_dynamodb_table.orders.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.order_consumer]
}

resource "aws_lambda_event_source_mapping" "orders" {
  event_source_arn = aws_sqs_queue.orders.arn
  function_name    = aws_lambda_function.order_consumer.arn
  batch_size       = 10
}
