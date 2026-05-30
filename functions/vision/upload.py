import json
import os
import uuid

import boto3

s3 = boto3.client("s3")
BUCKET = os.environ["S3_BUCKET"]
UPLOAD_EXPIRY = int(os.environ.get("UPLOAD_EXPIRY_SECONDS", "300"))


def handler(event, context):
    body = json.loads(event.get("body") or "{}")
    user_id = body.get("userId", "anonymous")
    ext = body.get("extension", "jpg").lstrip(".")
    key = f"frames/{user_id}/{uuid.uuid4()}.{ext}"

    url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": BUCKET,
            "Key": key,
            "ContentType": f"image/{ext if ext != 'jpg' else 'jpeg'}",
        },
        ExpiresIn=UPLOAD_EXPIRY,
    )

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps({"uploadUrl": url, "imageS3Key": key, "bucket": BUCKET}),
    }
