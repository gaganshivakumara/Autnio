import base64
import io
import json
import os

import boto3
from PIL import Image

s3 = boto3.client("s3")
bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))

# VISION_BUCKET is the env var set by CDK; S3_BUCKET is the legacy deploy.sh name
BUCKET = os.environ.get("VISION_BUCKET") or os.environ.get("S3_BUCKET", "")

MODELS = {
    "detect": os.environ.get("QWEN_VL_MODEL_ID", "qwen.qwen3-vl-235b-a22b"),
    "stream": os.environ.get("NEMOTRON_VL_MODEL_ID", "nvidia.nemotron-nano-12b-v2"),
}

DEFAULT_PROMPTS = {
    "detect": "Detect and locate all objects",
    "stream": "Describe the scene",
}


def _load_and_encode(bucket: str, key: str) -> str:
    """Fetch image from S3, resize to 512×512, return base64-encoded JPEG."""
    obj = s3.get_object(Bucket=bucket, Key=key)
    img = Image.open(io.BytesIO(obj["Body"].read())).convert("RGB")
    img = img.resize((512, 512))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _build_payload(image_b64: str, prompt: str, mode: str) -> dict:
    """Build the Bedrock InvokeModel payload for both Qwen and Nemotron.

    Both models accept the OpenAI-compatible messages format with an image_url
    content block embedding the base64 data URI.
    """
    max_tokens = 1024 if mode == "detect" else 512
    return {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        "max_tokens": max_tokens,
    }


def _extract_text(result: dict) -> str:
    """Extract the assistant text from Bedrock response.

    Qwen3-VL and Nemotron both return OpenAI-compatible choices format.
    Falls back gracefully for unexpected shapes.
    """
    if "choices" in result:
        return result["choices"][0]["message"]["content"]
    if "content" in result:
        content = result["content"]
        if isinstance(content, list):
            return content[0].get("text", "")
        return str(content)
    return str(result)


def handler(event, context):
    body = json.loads(event.get("body") or "{}")
    s3_key = body.get("imageS3Key", "")
    mode = body.get("mode", "detect")
    prompt = body.get("prompt") or DEFAULT_PROMPTS.get(mode, "Describe what you see.")

    cors_headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    }

    if not s3_key:
        return {
            "statusCode": 400,
            "headers": cors_headers,
            "body": json.dumps({"error": "imageS3Key is required"}),
        }

    if not BUCKET:
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": "VISION_BUCKET env var not set"}),
        }

    try:
        image_b64 = _load_and_encode(BUCKET, s3_key)
    except Exception as exc:
        return {
            "statusCode": 500,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Failed to fetch image from S3: {exc}"}),
        }

    model_id = MODELS.get(mode, MODELS["detect"])
    payload = _build_payload(image_b64, prompt, mode)

    try:
        resp = bedrock.invoke_model(
            modelId=model_id,
            body=json.dumps(payload),
            contentType="application/json",
            accept="application/json",
        )
        result = json.loads(resp["body"].read())
    except Exception as exc:
        return {
            "statusCode": 502,
            "headers": cors_headers,
            "body": json.dumps({"error": f"Bedrock invocation failed: {exc}"}),
        }

    text = _extract_text(result)
    return {
        "statusCode": 200,
        "headers": cors_headers,
        "body": json.dumps({"result": text, "data": {"model": model_id, "mode": mode}}),
    }
