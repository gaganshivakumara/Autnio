#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
PREFIX="autnio-dev"
AGENT_NAME="${PREFIX}-agent"
AGENT_ROLE="${PREFIX}-bedrock-agent-role"
LAMBDA_ROLE="${PREFIX}-agent-lambda-role"
FOUNDATION_MODEL="us.anthropic.claude-sonnet-4-6"
ROUTER_FN="${PREFIX}-vision-router"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
AGENT_DIR="${REPO_ROOT}/agent"
FN_DIR="${AGENT_DIR}/functions"
BUILD_DIR="$(mktemp -d)"
PACKAGE_ZIP="${BUILD_DIR}/agent-lambda.zip"

cleanup() { rm -rf "${BUILD_DIR}"; }
trap cleanup EXIT

echo "==> Building agent Lambda package..."
cp "${FN_DIR}"/*.py "${BUILD_DIR}/"
(cd "${BUILD_DIR}" && zip -qr "${PACKAGE_ZIP}" .)

create_lambda_role() {
  local role_name="$1"
  local policy_doc="$2"
  if ! aws iam get-role --role-name "${role_name}" >/dev/null 2>&1; then
    aws iam create-role \
      --role-name "${role_name}" \
      --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [{
          "Effect": "Allow",
          "Principal": {"Service": "lambda.amazonaws.com"},
          "Action": "sts:AssumeRole"
        }]
      }' >/dev/null
  fi
  aws iam put-role-policy \
    --role-name "${role_name}" \
    --policy-name "${role_name}-policy" \
    --policy-document "${policy_doc}" >/dev/null
  aws iam attach-role-policy \
    --role-name "${role_name}" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true
}

LAMBDA_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"],
      "Resource": "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/autnio-dev"
    },
    {
      "Effect": "Allow",
      "Action": ["lambda:InvokeFunction"],
      "Resource": "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${ROUTER_FN}"
    }
  ]
}
EOF
)

echo "==> Creating Lambda execution role..."
create_lambda_role "${LAMBDA_ROLE}" "${LAMBDA_POLICY}"
LAMBDA_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${LAMBDA_ROLE}"

deploy_lambda() {
  local fn_name="$1"
  local handler="$2"
  local env_vars="${3:-}"

  if aws lambda get-function --function-name "${fn_name}" --region "${REGION}" >/dev/null 2>&1; then
    aws lambda update-function-code \
      --function-name "${fn_name}" \
      --zip-file "fileb://${PACKAGE_ZIP}" \
      --region "${REGION}" >/dev/null
    aws lambda wait function-updated --function-name "${fn_name}" --region "${REGION}"
    if [[ -n "${env_vars}" ]]; then
      aws lambda update-function-configuration \
        --function-name "${fn_name}" \
        --handler "${handler}" \
        --environment "Variables={${env_vars}}" \
        --timeout 30 \
        --memory-size 256 \
        --region "${REGION}" >/dev/null
      aws lambda wait function-updated --function-name "${fn_name}" --region "${REGION}"
    fi
  else
    local create_args=(
      --function-name "${fn_name}"
      --runtime python3.12
      --role "${LAMBDA_ROLE_ARN}"
      --handler "${handler}"
      --zip-file "fileb://${PACKAGE_ZIP}"
      --timeout 30
      --memory-size 256
      --region "${REGION}"
    )
    if [[ -n "${env_vars}" ]]; then
      create_args+=(--environment "Variables={${env_vars}}")
    fi
    aws lambda create-function "${create_args[@]}" >/dev/null
    aws lambda wait function-active --function-name "${fn_name}" --region "${REGION}"
  fi
}

echo "==> Deploying action group Lambdas..."
sleep 5

# Apify token: prefer an exported APIFY_TOKEN, otherwise pull it from the
# Secrets Manager secret (/autnio/dev/apify-token). The scraper stays disabled
# until this secret has a real value.
APIFY_TOKEN="${APIFY_TOKEN:-$(aws secretsmanager get-secret-value --secret-id /autnio/dev/apify-token --query SecretString --output text --region "${REGION}" 2>/dev/null || true)}"
if [[ -z "${APIFY_TOKEN}" || "${APIFY_TOKEN}" == "None" ]]; then
  echo "    WARNING: no Apify token found (export APIFY_TOKEN=... or set the /autnio/dev/apify-token secret) — product discovery will report 'not configured'."
  APIFY_TOKEN=""
fi

deploy_lambda "${PREFIX}-agent-dispatch" "dispatch.handler" ""
deploy_lambda "${PREFIX}-agent-apify" "apify_scrape.handler" "APIFY_TOKEN=${APIFY_TOKEN},APIFY_PRODUCT_ACTOR=${APIFY_PRODUCT_ACTOR:-XVDTQc4a7MDTqSTMJ},APIFY_REVIEW_ACTOR=${APIFY_REVIEW_ACTOR:-gFtgG31RZJYlphznm}"
deploy_lambda "${PREFIX}-agent-box" "box_ops.handler" ""
deploy_lambda "${PREFIX}-agent-user" "user_prefs.handler" "DYNAMODB_TABLE=autnio-dev"
deploy_lambda "${PREFIX}-agent-vision" "vision_action.handler" "ROUTER_FUNCTION_NAME=${ROUTER_FN}"

DISPATCH_ARN="$(aws lambda get-function --function-name ${PREFIX}-agent-dispatch --query Configuration.FunctionArn --output text --region ${REGION})"
APIFY_ARN="$(aws lambda get-function --function-name ${PREFIX}-agent-apify --query Configuration.FunctionArn --output text --region ${REGION})"
BOX_ARN="$(aws lambda get-function --function-name ${PREFIX}-agent-box --query Configuration.FunctionArn --output text --region ${REGION})"
USER_ARN="$(aws lambda get-function --function-name ${PREFIX}-agent-user --query Configuration.FunctionArn --output text --region ${REGION})"
VISION_ARN="$(aws lambda get-function --function-name ${PREFIX}-agent-vision --query Configuration.FunctionArn --output text --region ${REGION})"

echo "==> Creating Bedrock Agent IAM role..."
AGENT_TRUST='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "bedrock.amazonaws.com"},
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {"aws:SourceAccount": "'"${ACCOUNT_ID}"'"},
      "ArnLike": {"aws:SourceArn": "arn:aws:bedrock:'"${REGION}"':'"${ACCOUNT_ID}"':agent/*"}
    }
  }]
}'

if ! aws iam get-role --role-name "${AGENT_ROLE}" >/dev/null 2>&1; then
  aws iam create-role \
    --role-name "${AGENT_ROLE}" \
    --assume-role-policy-document "${AGENT_TRUST}" \
    --description "Autnio Bedrock Agent execution role" >/dev/null
fi

AGENT_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      "Resource": [
        "arn:aws:bedrock:${REGION}::foundation-model/*",
        "arn:aws:bedrock:${REGION}:${ACCOUNT_ID}:inference-profile/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["lambda:InvokeFunction"],
      "Resource": [
        "${DISPATCH_ARN}",
        "${APIFY_ARN}",
        "${BOX_ARN}",
        "${USER_ARN}",
        "${VISION_ARN}"
      ]
    }
  ]
}
EOF
)

aws iam put-role-policy \
  --role-name "${AGENT_ROLE}" \
  --policy-name "${AGENT_ROLE}-policy" \
  --policy-document "${AGENT_POLICY}" >/dev/null

AGENT_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${AGENT_ROLE}"
echo "==> Waiting for IAM propagation..."
sleep 12

INSTRUCTIONS="$(cat "${AGENT_DIR}/prompts/system-prompt.md")"

EXISTING_AGENT_ID="$(aws bedrock-agent list-agents --region "${REGION}" \
  --query "agentSummaries[?agentName=='${AGENT_NAME}'].agentId | [0]" --output text)"

if [[ "${EXISTING_AGENT_ID}" == "None" || -z "${EXISTING_AGENT_ID}" ]]; then
  echo "==> Creating Bedrock Agent: ${AGENT_NAME}..."
  AGENT_ID="$(aws bedrock-agent create-agent \
    --agent-name "${AGENT_NAME}" \
    --foundation-model "${FOUNDATION_MODEL}" \
    --instruction "${INSTRUCTIONS}" \
    --agent-resource-role-arn "${AGENT_ROLE_ARN}" \
    --idle-session-ttl-in-seconds 600 \
    --region "${REGION}" \
    --query agent.agentId --output text)"
  for i in $(seq 1 30); do
    STATUS="$(aws bedrock-agent get-agent --agent-id "${AGENT_ID}" --region "${REGION}" --query agent.agentStatus --output text)"
    [[ "${STATUS}" != "CREATING" ]] && break
    sleep 3
  done
else
  AGENT_ID="${EXISTING_AGENT_ID}"
  echo "==> Updating existing Bedrock Agent: ${AGENT_ID}..."
  aws bedrock-agent update-agent \
    --agent-id "${AGENT_ID}" \
    --agent-name "${AGENT_NAME}" \
    --foundation-model "${FOUNDATION_MODEL}" \
    --instruction "${INSTRUCTIONS}" \
    --agent-resource-role-arn "${AGENT_ROLE_ARN}" \
    --idle-session-ttl-in-seconds 600 \
    --region "${REGION}" >/dev/null
fi

echo "    Agent ID: ${AGENT_ID}"

add_action_group() {
  local name="$1"
  local lambda_arn="$2"
  local schema_file="$3"

  local existing
  existing="$(aws bedrock-agent list-agent-action-groups \
    --agent-id "${AGENT_ID}" \
    --agent-version "DRAFT" \
    --region "${REGION}" \
    --query "actionGroupSummaries[?actionGroupName=='${name}'].actionGroupId | [0]" \
    --output text 2>/dev/null || echo "None")"

  local schema_payload
  schema_payload="$(cat "${schema_file}")"

  if [[ "${existing}" == "None" || -z "${existing}" ]]; then
    echo "    Creating action group: ${name}..."
    aws bedrock-agent create-agent-action-group \
      --agent-id "${AGENT_ID}" \
      --agent-version "DRAFT" \
      --action-group-name "${name}" \
      --action-group-state ENABLED \
      --action-group-executor "{\"lambda\":\"${lambda_arn}\"}" \
      --api-schema "{\"payload\":$(python3 -c "import json; print(json.dumps(open('${schema_file}').read()))")}" \
      --region "${REGION}" >/dev/null
  else
    echo "    Updating action group: ${name}..."
    aws bedrock-agent update-agent-action-group \
      --agent-id "${AGENT_ID}" \
      --agent-version "DRAFT" \
      --action-group-id "${existing}" \
      --action-group-name "${name}" \
      --action-group-state ENABLED \
      --action-group-executor "{\"lambda\":\"${lambda_arn}\"}" \
      --api-schema "{\"payload\":$(python3 -c "import json; print(json.dumps(open('${schema_file}').read()))")}" \
      --region "${REGION}" >/dev/null
  fi

  aws lambda add-permission \
    --function-name "${lambda_arn}" \
    --statement-id "bedrock-agent-${name}-$(date +%s)" \
    --action lambda:InvokeFunction \
    --principal bedrock.amazonaws.com \
    --source-arn "arn:aws:bedrock:${REGION}:${ACCOUNT_ID}:agent/${AGENT_ID}" \
    --region "${REGION}" >/dev/null 2>&1 || true
}

echo "==> Registering action groups..."
add_action_group "computer-automation" "${DISPATCH_ARN}" "${AGENT_DIR}/schemas/computer-automation.yaml"
add_action_group "web-data" "${APIFY_ARN}" "${AGENT_DIR}/schemas/web-data.yaml"
add_action_group "file-management" "${BOX_ARN}" "${AGENT_DIR}/schemas/file-management.yaml"
add_action_group "user-memory" "${USER_ARN}" "${AGENT_DIR}/schemas/user-memory.yaml"
add_action_group "vision" "${VISION_ARN}" "${AGENT_DIR}/schemas/vision.yaml"

echo "==> Preparing agent..."
aws bedrock-agent prepare-agent \
  --agent-id "${AGENT_ID}" \
  --region "${REGION}" >/dev/null

echo "    Waiting for agent to reach PREPARED state..."
for i in $(seq 1 30); do
  STATUS="$(aws bedrock-agent get-agent --agent-id "${AGENT_ID}" --region "${REGION}" --query agent.agentStatus --output text)"
  echo "    Status: ${STATUS}"
  if [[ "${STATUS}" == "PREPARED" || "${STATUS}" == "FAILED" ]]; then
    break
  fi
  sleep 5
done

echo "==> Creating aliases..."
sleep 10
create_alias() {
  local alias_name="$1"
  local existing
  existing="$(aws bedrock-agent list-agent-aliases \
    --agent-id "${AGENT_ID}" \
    --region "${REGION}" \
    --query "agentAliasSummaries[?agentAliasName=='${alias_name}'].agentAliasId | [0]" \
    --output text 2>/dev/null || echo "None")"

  if [[ "${existing}" == "None" || -z "${existing}" ]]; then
    for i in $(seq 1 8); do
      if OUT=$(aws bedrock-agent create-agent-alias \
        --agent-id "${AGENT_ID}" \
        --agent-alias-name "${alias_name}" \
        --description "Autnio ${alias_name} alias" \
        --region "${REGION}" \
        --query agentAlias.agentAliasId --output text 2>&1); then
        echo "${OUT}"
        return
      fi
      sleep 8
    done
  else
    echo "${existing}"
  fi
}
DEV_ALIAS_ID="$(create_alias dev)"
PROD_ALIAS_ID="$(create_alias prod)"

store_secret() {
  local name="$1"
  local value="$2"
  if aws secretsmanager describe-secret --secret-id "${name}" --region "${REGION}" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value --secret-id "${name}" --secret-string "${value}" --region "${REGION}" >/dev/null
  else
    aws secretsmanager create-secret --name "${name}" --secret-string "${value}" --region "${REGION}" >/dev/null
  fi
}

store_secret "/autnio/dev/bedrock/agent-id" "${AGENT_ID}"
store_secret "/autnio/dev/bedrock/agent-alias-dev" "${DEV_ALIAS_ID}"
store_secret "/autnio/dev/bedrock/agent-alias-prod" "${PROD_ALIAS_ID}"

cat <<EOF

========================================
Autnio Bedrock Agent — AWS Setup Complete
========================================

Agent Name:       ${AGENT_NAME}
Agent ID:         ${AGENT_ID}
Agent Status:     ${STATUS}
Foundation Model: ${FOUNDATION_MODEL}
Dev Alias ID:     ${DEV_ALIAS_ID}
Prod Alias ID:    ${PROD_ALIAS_ID}
Agent Role:       ${AGENT_ROLE_ARN}

Action Groups:
  computer-automation → ${DISPATCH_ARN}
  web-research        → ${APIFY_ARN}
  file-management     → ${BOX_ARN}
  user-preferences    → ${USER_ARN}
  vision              → ${VISION_ARN}

Secrets:
  /autnio/dev/bedrock/agent-id
  /autnio/dev/bedrock/agent-alias-dev
  /autnio/dev/bedrock/agent-alias-prod

EOF
