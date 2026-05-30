#!/usr/bin/env bash
# Deploy the Python vision handler to the CDK-managed analyzeImage Lambda.
# Replaces the JS "Not implemented" stub with handler.py (Qwen3-VL + Nemotron).
#
# Usage:
#   ./deploy-analyze-image.sh [appEnv]        # appEnv defaults to "dev"
#   AWS_PROFILE=myprofile ./deploy-analyze-image.sh
set -euo pipefail

APP_ENV="${1:-dev}"
REGION="${AWS_REGION:-us-east-1}"
FN_NAME="autnio-${APP_ENV}-analyzeimage"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$(mktemp -d)"
PACKAGE_ZIP="${BUILD_DIR}/vision-lambda.zip"

cleanup() { rm -rf "${BUILD_DIR}"; }
trap cleanup EXIT

echo "==> Building Lambda package for ${FN_NAME}..."
pip install \
  --quiet \
  -t "${BUILD_DIR}/pkg" \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.12 \
  --only-binary=:all: \
  "Pillow>=10.0.0"

cp "${SCRIPT_DIR}/handler.py" "${BUILD_DIR}/pkg/"
(cd "${BUILD_DIR}/pkg" && zip -qr "${PACKAGE_ZIP}" . -x "*.pyc" -x "__pycache__/*")
echo "    Package size: $(du -sh "${PACKAGE_ZIP}" | cut -f1)"

echo "==> Verifying Lambda exists: ${FN_NAME}"
aws lambda get-function --function-name "${FN_NAME}" --region "${REGION}" \
  --query 'Configuration.[FunctionName,Runtime,Handler]' --output table

echo "==> Uploading new code..."
aws lambda update-function-code \
  --function-name "${FN_NAME}" \
  --zip-file "fileb://${PACKAGE_ZIP}" \
  --region "${REGION}" \
  --query '[FunctionName,CodeSize,LastModified]' \
  --output table

echo "==> Waiting for update to complete..."
aws lambda wait function-updated \
  --function-name "${FN_NAME}" \
  --region "${REGION}"

echo "==> Switching runtime → python3.12, handler → handler.handler..."
aws lambda update-function-configuration \
  --function-name "${FN_NAME}" \
  --runtime python3.12 \
  --handler handler.handler \
  --timeout 60 \
  --memory-size 512 \
  --region "${REGION}" \
  --query '[FunctionName,Runtime,Handler,Timeout,MemorySize]' \
  --output table

echo "==> Waiting for configuration update to complete..."
aws lambda wait function-updated \
  --function-name "${FN_NAME}" \
  --region "${REGION}"

echo ""
echo "==> Final configuration:"
aws lambda get-function-configuration \
  --function-name "${FN_NAME}" \
  --region "${REGION}" \
  --query '{FunctionName:FunctionName,Runtime:Runtime,Handler:Handler,Timeout:Timeout,MemorySize:MemorySize,Environment:Environment.Variables}' \
  --output json

echo ""
echo "==========================================="
echo "  Deploy complete: ${FN_NAME}"
echo "  Runtime : python3.12"
echo "  Handler : handler.handler"
echo "  Region  : ${REGION}"
echo "==========================================="
