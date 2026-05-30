import json
import os

import boto3

from preprocessor import load_and_encode

bedrock = boto3.client("bedrock-runtime")
MODEL_ID = os.environ["QWEN_VL_MODEL_ID"]


def invoke_qwen(s3_key: str, prompt: str) -> dict:
    image_b64 = load_and_encode(os.environ["S3_BUCKET"], s3_key)

    body = {
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
        "max_tokens": 1024,
    }

    response = bedrock.invoke_model(
        modelId=MODEL_ID,
        body=json.dumps(body),
        contentType="application/json",
        accept="application/json",
    )
    result = json.loads(response["body"].read())
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(
            {"result": result["choices"][0]["message"]["content"], "data": {}}
        ),
    }


def handler(event, context):
    body = json.loads(event.get("body") or "{}")
    s3_key = body.get("imageS3Key", "")
    prompt = body.get("prompt", "Detect and locate all objects")
    if not s3_key:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "imageS3Key is required"}),
        }
    return invoke_qwen(s3_key, prompt)
