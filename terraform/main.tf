terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

variable "dynamo_table" {
  default = "shortener-dynamo-table"
}

variable "base_url" {
  default = "https://miweb.com"
}

# Tabla DynamoDB
resource "aws_dynamodb_table" "shortener_table" {
  name           = var.dynamo_table
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "code"

  attribute {
    name = "code"
    type = "S"
  }

  tags = {
    Name        = "shortener-dynamo-table"
    Environment = "production"
  }
}

# IAM Role para Lambda
resource "aws_iam_role" "lambda_role" {
  name = "shortener-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Permisos para DynamoDB
resource "aws_iam_role_policy" "dynamodb_access" {
  name = "dynamodb-access"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:Scan"
      ]
      Resource = aws_dynamodb_table.shortener_table.arn
    }]
  })
}

# Lambda Function
resource "aws_lambda_function" "shortener" {
  function_name = "shortener-lambda"
  runtime       = "nodejs20.x"
  handler       = "handler.handler"
  role          = aws_iam_role.lambda_role.arn

  filename         = "../bundle.zip"
  source_code_hash = filebase64sha256("../bundle.zip")

  environment {
    variables = {
      TABLE_NAME = var.dynamo_table
      BASE_URL   = var.base_url
    }
  }

  depends_on = [
    aws_dynamodb_table.shortener_table
  ]
}

# API Gateway SIN configuración CORS automática
resource "aws_apigatewayv2_api" "http_api" {
  name          = "shortener-api"
  protocol_type = "HTTP"
  # SIN cors_configuration - control manual desde Lambda
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.shortener.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "shorten_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /shorten"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

# Ruta OPTIONS para manejar preflight CORS
resource "aws_apigatewayv2_route" "options_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "OPTIONS /shorten"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

# Ruta OPTIONS genérica para cualquier ruta
resource "aws_apigatewayv2_route" "options_proxy" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "OPTIONS /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_lambda_permission" "lambda_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.shortener.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

resource "aws_apigatewayv2_stage" "production" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "production"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_logs.arn
    format          = "$context.requestId $context.status $context.error.message"
  }
}

resource "aws_cloudwatch_log_group" "api_logs" {
  name = "/aws/apigateway/shortener-api"
}

output "invoke_url" {
  value = "${aws_apigatewayv2_api.http_api.api_endpoint}/production"
}

output "api_gateway_url" {
  value = aws_apigatewayv2_api.http_api.api_endpoint
}

output "stage_name" {
  value = aws_apigatewayv2_stage.production.name
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.shortener_table.name
}

output "full_invoke_url" {
  value = "${aws_apigatewayv2_api.http_api.api_endpoint}/production/shorten"
}