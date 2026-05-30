#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
PREFIX="autnio-dev"
BUCKET="${PREFIX}-vision-frames"
ROLE_NAME="${PREFIX}-vision-lambda-role"
API_NAME="${PREFIX}-vision-api"

QWEN_MODEL="qwen.qwen3-vl-235b-a22b"
NEMOTRON_MODEL="nvidia.nemotron-nano-12b-v2"

QWEN_FN="${PREFIX}-vision-qwen"
NEMOTRON_FN="${PREFIX}-vision-nemotron"
ROUTER_FN="${PREFIX}-vision-router"
UPLOAD_FN="${PREFIX}-vision-upload"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$(mktemp -d)"
PACKAGE_ZIP="${BUILD_DIR}/vision-lambda.zip"

cleanup() { rm -rf "${BUILD_DIR}"; }
trap cleanup EXIT

echo "==> Building Lambda package..."
pip install -q -r "${SCRIPT_DIR}/requirements.txt" \
  -t "${BUILD_DIR}/package" \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.12 \
  --only-binary=:all: 2>/dev/null || \
pip install -q -r "${SCRIPT_DIR}/requirements.txt" -t "${BUILD_DIR}/package"

cp "${SCRIPT_DIR}"/*.py "${BUILD_DIR}/package/"
(cd "${BUILD_DIR}/package" && zip -qr "${PACKAGE_ZIP}" .)

echo "==> Creating S3 bucket: ${BUCKET}"
if ! aws s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  aws s3api create-bucket \
    --bucket "${BUCKET}" \
    --region "${REGION}" \
    --create-bucket-configuration LocationConstraint="${REGION}" 2>/dev/null || \
  aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}"
fi

aws s3api put-public-access-block --bucket "${BUCKET}" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-cors --bucket "${BUCKET}" --cors-configuration '{
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }]
}'

echo "==> Creating IAM role: ${ROLE_NAME}"
TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}'

if ! aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document "${TRUST_POLICY}" \
    --description "Autnio Dev4 vision Lambda execution role"
fi

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

INLINE_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:${REGION}:${ACCOUNT_ID}:*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::${BUCKET}/*"
    },
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": [
        "arn:aws:bedrock:${REGION}::foundation-model/${QWEN_MODEL}",
        "arn:aws:bedrock:${REGION}::foundation-model/${NEMOTRON_MODEL}"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["lambda:InvokeFunction"],
      "Resource": [
        "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${QWEN_FN}",
        "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${NEMOTRON_FN}"
      ]
    }
  ]
}
EOF
)

aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name "${PREFIX}-vision-policy" \
  --policy-document "${INLINE_POLICY}"

aws iam attach-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true

echo "==> Waiting for IAM role propagation..."
sleep 10

deploy_lambda() {
  local fn_name="$1"
  local handler="$2"
  local env_vars="$3"

  if aws lambda get-function --function-name "${fn_name}" --region "${REGION}" >/dev/null 2>&1; then
    echo "    Updating ${fn_name}..."
    aws lambda update-function-code \
      --function-name "${fn_name}" \
      --zip-file "fileb://${PACKAGE_ZIP}" \
      --region "${REGION}" >/dev/null
    aws lambda wait function-updated --function-name "${fn_name}" --region "${REGION}"
    aws lambda update-function-configuration \
      --function-name "${fn_name}" \
      --handler "${handler}" \
      --environment "Variables={${env_vars}}" \
      --timeout 60 \
      --memory-size 512 \
      --region "${REGION}" >/dev/null
    aws lambda wait function-updated --function-name "${fn_name}" --region "${REGION}"
  else
    echo "    Creating ${fn_name}..."
    aws lambda create-function \
      --function-name "${fn_name}" \
      --runtime python3.12 \
      --role "${ROLE_ARN}" \
      --handler "${handler}" \
      --zip-file "fileb://${PACKAGE_ZIP}" \
      --timeout 60 \
      --memory-size 512 \
      --environment "Variables={${env_vars}}" \
      --region "${REGION}" >/dev/null
    aws lambda wait function-active --function-name "${fn_name}" --region "${REGION}"
  fi
}

echo "==> Deploying Lambda functions..."
deploy_lambda "${QWEN_FN}" "qwen_detect.handler" \
  "S3_BUCKET=${BUCKET},QWEN_VL_MODEL_ID=${QWEN_MODEL}"

deploy_lambda "${NEMOTRON_FN}" "nemotron_stream.handler" \
  "S3_BUCKET=${BUCKET},NEMOTRON_VL_MODEL_ID=${NEMOTRON_MODEL}"

deploy_lambda "${ROUTER_FN}" "router.handler" \
  "QWEN_FUNCTION_NAME=${QWEN_FN},NEMOTRON_FUNCTION_NAME=${NEMOTRON_FN}"

deploy_lambda "${UPLOAD_FN}" "upload.handler" \
  "S3_BUCKET=${BUCKET},UPLOAD_EXPIRY_SECONDS=300"

QWEN_ARN="$(aws lambda get-function --function-name "${QWEN_FN}" --query 'Configuration.FunctionArn' --output text --region "${REGION}")"
NEMOTRON_ARN="$(aws lambda get-function --function-name "${NEMOTRON_FN}" --query 'Configuration.FunctionArn' --output text --region "${REGION}")"
ROUTER_ARN="$(aws lambda get-function --function-name "${ROUTER_FN}" --query 'Configuration.FunctionArn' --output text --region "${REGION}")"
UPLOAD_ARN="$(aws lambda get-function --function-name "${UPLOAD_FN}" --query 'Configuration.FunctionArn' --output text --region "${REGION}")"

echo "==> Storing model IDs in Secrets Manager..."
store_secret() {
  local name="$1"
  local value="$2"
  if aws secretsmanager describe-secret --secret-id "${name}" --region "${REGION}" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value \
      --secret-id "${name}" \
      --secret-string "${value}" \
      --region "${REGION}" >/dev/null
  else
    aws secretsmanager create-secret \
      --name "${name}" \
      --secret-string "${value}" \
      --region "${REGION}" >/dev/null
  fi
}
store_secret "/autnio/dev/bedrock/qwen-model-id" "${QWEN_MODEL}"
store_secret "/autnio/dev/bedrock/nemotron-model-id" "${NEMOTRON_MODEL}"
store_secret "/autnio/dev/vision/s3-bucket" "${BUCKET}"
store_secret "/autnio/dev/vision/router-lambda-arn" "${ROUTER_ARN}"

echo "==> Creating API Gateway: ${API_NAME}"
EXISTING_API_ID="$(aws apigateway get-rest-apis --region "${REGION}" \
  --query "items[?name=='${API_NAME}'].id | [0]" --output text)"

if [[ "${EXISTING_API_ID}" == "None" || -z "${EXISTING_API_ID}" ]]; then
  API_ID="$(aws apigateway create-rest-api \
    --name "${API_NAME}" \
    --description "Autnio Dev4 vision pipeline API" \
    --endpoint-configuration types=REGIONAL \
    --region "${REGION}" \
    --query id --output text)"
else
  API_ID="${EXISTING_API_ID}"
fi

ROOT_ID="$(aws apigateway get-resources --rest-api-id "${API_ID}" --region "${REGION}" \
  --query "items[?path=='/'].id" --output text)"

add_lambda_route() {
  local path_part="$1"
  local fn_arn="$2"
  local resource_path="/${path_part}"

  local resource_id
  resource_id="$(aws apigateway get-resources --rest-api-id "${API_ID}" --region "${REGION}" \
    --query "items[?path=='${resource_path}'].id | [0]" --output text)"

  if [[ "${resource_id}" == "None" || -z "${resource_id}" ]]; then
    resource_id="$(aws apigateway create-resource \
      --rest-api-id "${API_ID}" \
      --parent-id "${ROOT_ID}" \
      --path-part "${path_part}" \
      --region "${REGION}" \
      --query id --output text)"
  fi

  aws apigateway put-method \
    --rest-api-id "${API_ID}" \
    --resource-id "${resource_id}" \
    --http-method POST \
    --authorization-type NONE \
    --region "${REGION}" >/dev/null 2>&1 || true

  aws apigateway put-method \
    --rest-api-id "${API_ID}" \
    --resource-id "${resource_id}" \
    --http-method OPTIONS \
    --authorization-type NONE \
    --region "${REGION}" >/dev/null 2>&1 || true

  aws apigateway put-integration \
    --rest-api-id "${API_ID}" \
    --resource-id "${resource_id}" \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${fn_arn}/invocations" \
    --region "${REGION}" >/dev/null

  aws apigateway put-integration \
    --rest-api-id "${API_ID}" \
    --resource-id "${resource_id}" \
    --http-method OPTIONS \
    --type MOCK \
    --request-templates '{"application/json":"{\"statusCode\":200}"}' \
    --region "${REGION}" >/dev/null 2>&1 || true

  aws apigateway put-method-response \
    --rest-api-id "${API_ID}" \
    --resource-id "${resource_id}" \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":false,"method.response.header.Access-Control-Allow-Methods":false,"method.response.header.Access-Control-Allow-Origin":false}' \
    --region "${REGION}" >/dev/null 2>&1 || true

  aws apigateway put-integration-response \
    --rest-api-id "${API_ID}" \
    --resource-id "${resource_id}" \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'POST,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' \
    --response-templates '{"application/json":""}' \
    --region "${REGION}" >/dev/null 2>&1 || true

  aws lambda add-permission \
    --function-name "${fn_arn}" \
    --statement-id "apigw-${path_part}-$(date +%s)" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*/*" \
    --region "${REGION}" >/dev/null 2>&1 || true
}

add_lambda_route "vision" "${ROUTER_ARN}"
add_lambda_route "upload" "${UPLOAD_ARN}"

aws apigateway create-deployment \
  --rest-api-id "${API_ID}" \
  --stage-name prod \
  --region "${REGION}" >/dev/null

API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod"

cat <<EOF

========================================
Autnio Dev4 Vision — AWS Setup Complete
========================================

S3 Bucket:           ${BUCKET}
Vision Router Lambda: ${ROUTER_ARN}
Qwen Detect Lambda:   ${QWEN_ARN}
Nemotron Lambda:      ${NEMOTRON_ARN}
Upload Lambda:        ${UPLOAD_ARN}

API Gateway URL:      ${API_URL}
  POST ${API_URL}/upload   — get pre-signed S3 upload URL
  POST ${API_URL}/vision   — run vision pipeline (mode=detect|stream)

Cognito (from Dev 3):
  VITE_COGNITO_USER_POOL_ID=us-east-1_DMemAnPH9
  VITE_COGNITO_CLIENT_ID=6ga1htqj4i1t7uonpmg0cqhh5b

Web app .env:
  VITE_REST_API_URL=${API_URL}
  VITE_S3_UPLOAD_LAMBDA_URL=${API_URL}/upload
  VITE_COGNITO_USER_POOL_ID=us-east-1_DMemAnPH9
  VITE_COGNITO_CLIENT_ID=6ga1htqj4i1t7uonpmg0cqhh5b

EOF
