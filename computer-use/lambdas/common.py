from __future__ import annotations

import json
import os
import time
from typing import Any

try:
    import boto3
except Exception:  # noqa: BLE001
    boto3 = None


CONNECTIONS_TABLE_NAME = os.environ.get("CONNECTIONS_TABLE_NAME", "connections")
TASKS_TABLE_NAME = os.environ.get("TASKS_TABLE_NAME", "tasks")
CONNECTION_TTL_SECONDS = int(os.environ.get("CONNECTION_TTL_SECONDS", "86400"))

if boto3 is not None:
    dynamodb = boto3.resource("dynamodb")
else:
    dynamodb = None


def json_body(payload: dict[str, Any], status_code: int = 200) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "body": json.dumps(payload),
    }


def now_epoch() -> int:
    return int(time.time())


def connection_ttl() -> int:
    return now_epoch() + CONNECTION_TTL_SECONDS


def connections_table():
    if dynamodb is None:
        raise RuntimeError("boto3 is not available")
    return dynamodb.Table(CONNECTIONS_TABLE_NAME)


def tasks_table():
    if dynamodb is None:
        raise RuntimeError("boto3 is not available")
    return dynamodb.Table(TASKS_TABLE_NAME)
