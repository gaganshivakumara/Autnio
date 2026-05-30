#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
MODEL_DIR="${IOS_DIR}/AutnioSpatialGuide/Models"
CACHE_DIR="${IOS_DIR}/.model-cache/yolov12"
MODEL_SIZE="${1:-n}"
MODEL_NAME="yolov12${MODEL_SIZE}"
MODEL_URL="https://github.com/sunsmarterjie/yolov12/releases/download/turbo/${MODEL_NAME}.pt"
VENV_DIR="${CACHE_DIR}/.venv"

mkdir -p "${MODEL_DIR}" "${CACHE_DIR}"

case "${MODEL_SIZE}" in
  n|s)
    ;;
  *)
    echo "Use n or s for real-time iPhone builds. Larger YOLOv12 models may be too slow on device." >&2
    exit 1
    ;;
esac

if [[ ! -d "${VENV_DIR}" ]]; then
  python3 -m venv "${VENV_DIR}"
fi

"${VENV_DIR}/bin/python" -m pip install --upgrade pip
"${VENV_DIR}/bin/python" -m pip install "git+https://github.com/sunsmarterjie/yolov12.git" coremltools

if [[ ! -f "${CACHE_DIR}/${MODEL_NAME}.pt" ]]; then
  curl -L "${MODEL_URL}" -o "${CACHE_DIR}/${MODEL_NAME}.pt"
fi

cat > "${CACHE_DIR}/export_coreml.py" <<'PY'
import sys
from pathlib import Path
from ultralytics import YOLO

weights = Path(sys.argv[1]).resolve()
out_dir = Path(sys.argv[2]).resolve()
model = YOLO(str(weights))

# nms=True creates a detector-style CoreML package that is easier to use from Vision.
exported = model.export(format="coreml", nms=True, imgsz=640, half=True)
exported_path = Path(exported).resolve()
target = out_dir / "AutnioObjectDetector.mlpackage"

if target.exists():
    import shutil
    shutil.rmtree(target)

import shutil
shutil.move(str(exported_path), str(target))
print(target)
PY

"${VENV_DIR}/bin/python" "${CACHE_DIR}/export_coreml.py" "${CACHE_DIR}/${MODEL_NAME}.pt" "${MODEL_DIR}"

echo "Saved ${MODEL_DIR}/AutnioObjectDetector.mlpackage"
echo "Next: drag AutnioObjectDetector.mlpackage into the Xcode project and check 'Copy items if needed'."
