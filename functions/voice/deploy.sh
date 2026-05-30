#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
PREFIX="autnio-dev"
ROLE_NAME="${PREFIX}-voice-lambda-role"
API_ID="${VOICE_REST_API_ID:-w8nqi59tnc}"
STAGE_NAME="${VOICE_API_STAGE:-dev}"
USER_POOL_ARN="arn:aws:cognito-idp:${REGION}:${ACCOUNT_ID}:userpool/us-east-1_DMemAnPH9"

TRANSCRIBE_FN="${PREFIX}-voice-transcribe"
TTS_FN="${PREFIX}-voice-tts"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$(mktemp -d)"
PACKAGE_ZIP="${BUILD_DIR}/voice-lambda.zip"

cleanup() { rm -rf "${BUILD_DIR}"; }
trap cleanup EXIT

echo "==> Building voice Lambda package..."
python3 -m pip install -q -r "${SCRIPT_DIR}/requirements.txt" \
  -t "${BUILD_DIR}/package" \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.12 \
  --only-binary=:all:
cp "${SCRIPT_DIR}"/*.py "${BUILD_DIR}/package/"
(cd "${BUILD_DIR}/package" && zip -qr "${PACKAGE_ZIP}" .)

echo "==> Creating IAM role: ${ROLE_NAME}"
if ! aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "lambda.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }' >/dev/null
fi

POLICY="$(cat <<EOF
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
      "Action": ["transcribe:StartStreamTranscription"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["polly:SynthesizeSpeech"],
      "Resource": "*"
    }
  ]
}
EOF
)"

aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name "${PREFIX}-voice-policy" \
  --policy-document "${POLICY}" >/dev/null

aws iam attach-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null 2>&1 || true

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo "==> Waiting for IAM propagation..."
sleep 10

deploy_lambda() {
  local fn_name="$1"
  local handler="$2"
  local timeout="$3"
  local env_vars="$4"

  if aws lambda get-function --function-name "${fn_name}" --region "${REGION}" >/dev/null 2>&1; then
    echo "    Updating ${fn_name}"
    aws lambda update-function-code \
      --function-name "${fn_name}" \
      --zip-file "fileb://${PACKAGE_ZIP}" \
      --region "${REGION}" >/dev/null
    aws lambda wait function-updated --function-name "${fn_name}" --region "${REGION}"
    aws lambda update-function-configuration \
      --function-name "${fn_name}" \
      --handler "${handler}" \
      --timeout "${timeout}" \
      --memory-size 512 \
      --environment "Variables={${env_vars}}" \
      --region "${REGION}" >/dev/null
    aws lambda wait function-updated --function-name "${fn_name}" --region "${REGION}"
  else
    echo "    Creating ${fn_name}"
    aws lambda create-function \
      --function-name "${fn_name}" \
      --runtime python3.12 \
      --role "${ROLE_ARN}" \
      --handler "${handler}" \
      --zip-file "fileb://${PACKAGE_ZIP}" \
      --timeout "${timeout}" \
      --memory-size 512 \
      --environment "Variables={${env_vars}}" \
      --region "${REGION}" >/dev/null
    aws lambda wait function-active --function-name "${fn_name}" --region "${REGION}"
  fi
}

echo "==> Deploying Lambdas..."
deploy_lambda "${TRANSCRIBE_FN}" "transcribe.handler" 30 "TRANSCRIBE_REGION=${REGION}"
deploy_lambda "${TTS_FN}" "tts.handler" 15 "POLLY_VOICE_ID=Joanna,POLLY_ENGINE=neural"

TRANSCRIBE_ARN="$(aws lambda get-function --function-name "${TRANSCRIBE_FN}" --region "${REGION}" --query 'Configuration.FunctionArn' --output text)"
TTS_ARN="$(aws lambda get-function --function-name "${TTS_FN}" --region "${REGION}" --query 'Configuration.FunctionArn' --output text)"

echo "==> Configuring API Gateway routes on ${API_ID}"
ROOT_ID="$(aws apigateway get-resources --rest-api-id "${API_ID}" --region "${REGION}" --query "items[?path=='/'].id | [0]" --output text)"

get_or_create_resource() {
  local parent_id="$1"
  local path="$2"
  local part="$3"
  local resource_id
  resource_id="$(aws apigateway get-resources --rest-api-id "${API_ID}" --region "${REGION}" --query "items[?path=='${path}'].id | [0]" --output text)"
  if [[ "${resource_id}" == "None" || -z "${resource_id}" ]]; then
    resource_id="$(aws apigateway create-resource --rest-api-id "${API_ID}" --parent-id "${parent_id}" --path-part "${part}" --region "${REGION}" --query id --output text)"
  fi
  echo "${resource_id}"
}

VOICE_ID="$(get_or_create_resource "${ROOT_ID}" "/voice" "voice")"
TRANSCRIBE_RESOURCE_ID="$(get_or_create_resource "${VOICE_ID}" "/voice/transcribe" "transcribe")"
TTS_RESOURCE_ID="$(get_or_create_resource "${VOICE_ID}" "/voice/tts" "tts")"

AUTHORIZER_ID="$(aws apigateway get-authorizers --rest-api-id "${API_ID}" --region "${REGION}" --query "items[?name=='autnio-dev-jwt'].id | [0]" --output text)"
if [[ "${AUTHORIZER_ID}" == "None" || -z "${AUTHORIZER_ID}" ]]; then
  AUTHORIZER_ID="$(aws apigateway create-authorizer \
    --rest-api-id "${API_ID}" \
    --name autnio-dev-jwt \
    --type COGNITO_USER_POOLS \
    --provider-arns "${USER_POOL_ARN}" \
    --identity-source method.request.header.Authorization \
    --region "${REGION}" \
    --query id --output text)"
fi

put_options() {
  local resource_id="$1"
  aws apigateway put-method --rest-api-id "${API_ID}" --resource-id "${resource_id}" --http-method OPTIONS --authorization-type NONE --region "${REGION}" >/dev/null 2>&1 || true
  aws apigateway put-integration --rest-api-id "${API_ID}" --resource-id "${resource_id}" --http-method OPTIONS --type MOCK --request-templates '{"application/json":"{\"statusCode\":200}"}' --region "${REGION}" >/dev/null
  aws apigateway put-method-response --rest-api-id "${API_ID}" --resource-id "${resource_id}" --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":false,"method.response.header.Access-Control-Allow-Methods":false,"method.response.header.Access-Control-Allow-Origin":false}' --region "${REGION}" >/dev/null 2>&1 || true
  aws apigateway put-integration-response --rest-api-id "${API_ID}" --resource-id "${resource_id}" --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'\''Content-Type,Authorization'\''","method.response.header.Access-Control-Allow-Methods":"'\''POST,OPTIONS'\''","method.response.header.Access-Control-Allow-Origin":"'\''*'\''"}' --response-templates '{"application/json":""}' --region "${REGION}" >/dev/null 2>&1 || true
}

put_route() {
  local resource_id="$1"
  local fn_arn="$2"
  local statement_suffix="$3"

  aws apigateway put-method \
    --rest-api-id "${API_ID}" \
    --resource-id "${resource_id}" \
    --http-method POST \
    --authorization-type COGNITO_USER_POOLS \
    --authorizer-id "${AUTHORIZER_ID}" \
    --region "${REGION}" >/dev/null 2>&1 || true

  aws apigateway put-integration \
    --rest-api-id "${API_ID}" \
    --resource-id "${resource_id}" \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${fn_arn}/invocations" \
    --region "${REGION}" >/dev/null

  aws lambda add-permission \
    --function-name "${fn_arn}" \
    --statement-id "apigw-voice-${statement_suffix}-$(date +%s)" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/POST/voice/*" \
    --region "${REGION}" >/dev/null 2>&1 || true
}

put_options "${TRANSCRIBE_RESOURCE_ID}"
put_options "${TTS_RESOURCE_ID}"
put_route "${TRANSCRIBE_RESOURCE_ID}" "${TRANSCRIBE_ARN}" "transcribe"
put_route "${TTS_RESOURCE_ID}" "${TTS_ARN}" "tts"

aws apigateway create-deployment --rest-api-id "${API_ID}" --stage-name "${STAGE_NAME}" --region "${REGION}" >/dev/null

API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/${STAGE_NAME}"

store_secret() {
  local name="$1"
  local value="$2"
  if aws secretsmanager describe-secret --secret-id "${name}" --region "${REGION}" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value --secret-id "${name}" --secret-string "${value}" --region "${REGION}" >/dev/null
  else
    aws secretsmanager create-secret --name "${name}" --secret-string "${value}" --region "${REGION}" >/dev/null
  fi
}

store_secret /autnio/dev/voice/transcribe-lambda-arn "${TRANSCRIBE_ARN}"
store_secret /autnio/dev/voice/tts-lambda-arn "${TTS_ARN}"
store_secret /autnio/dev/voice/api-url "${API_URL}"
store_secret /autnio/dev/voice/transcribe-url "${API_URL}/voice/transcribe"
store_secret /autnio/dev/voice/tts-url "${API_URL}/voice/tts"

cat <<EOF

========================================
Autnio Dev5 Voice — AWS Setup Complete
========================================
Transcribe Lambda: ${TRANSCRIBE_ARN}
TTS Lambda:        ${TTS_ARN}
REST API URL:      ${API_URL}
POST ${API_URL}/voice/transcribe
POST ${API_URL}/voice/tts

Both POST routes use Cognito authorizer autnio-dev-jwt.
EOF
