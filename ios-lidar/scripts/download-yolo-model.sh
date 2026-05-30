#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
MODEL_DIR="${IOS_DIR}/AutnioSpatialGuide/Models"
MODEL_NAME="${1:-yolo26n}"
MODEL_URL="https://github.com/ultralytics/yolo-ios-app/releases/download/v8.3.0/${MODEL_NAME}.mlpackage.zip"
ZIP_PATH="${MODEL_DIR}/${MODEL_NAME}.mlpackage.zip"

mkdir -p "${MODEL_DIR}"

echo "Downloading ${MODEL_NAME} CoreML model..."
curl -L "${MODEL_URL}" -o "${ZIP_PATH}"

echo "Unzipping model..."
unzip -o "${ZIP_PATH}" -d "${MODEL_DIR}"

FOUND_MODEL="$(find "${MODEL_DIR}" -maxdepth 1 -name "${MODEL_NAME}.mlpackage" -print -quit)"
if [[ -z "${FOUND_MODEL}" ]]; then
  echo "Could not find ${MODEL_NAME}.mlpackage after unzip." >&2
  exit 1
fi

rm -rf "${MODEL_DIR}/AutnioObjectDetector.mlpackage"
mv "${FOUND_MODEL}" "${MODEL_DIR}/AutnioObjectDetector.mlpackage"

echo "Saved ${MODEL_DIR}/AutnioObjectDetector.mlpackage"
echo "Next: drag AutnioObjectDetector.mlpackage into the Xcode project and check 'Copy items if needed'."
