import base64
import io

import boto3
from PIL import Image

s3 = boto3.client("s3")


def load_and_encode(bucket: str, key: str) -> str:
    obj = s3.get_object(Bucket=bucket, Key=key)
    img = Image.open(io.BytesIO(obj["Body"].read())).convert("RGB")
    img = img.resize((512, 512))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")
