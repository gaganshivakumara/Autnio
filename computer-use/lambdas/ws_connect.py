from __future__ import annotations

import json
import os
from typing import Any
from urllib.parse import parse_qs
from urllib.request import urlopen

try:
    import jwt
except Exception:  # noqa: BLE001
    jwt = None

from common import connection_ttl, connections_table, json_body


AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
ALLOW_DEV_BYPASS = os.environ.get("ALLOW_DEV_BYPASS", "false").lower() == "true"


def _parse_token(event: dict[str, Any]) -> str | None:
    query = event.get("queryStringParameters") or {}
    if "token" in query:
        return query.get("token")

    raw_query = event.get("rawQueryString")
    if isinstance(raw_query, str) and raw_query:
        parsed = parse_qs(raw_query)
        tokens = parsed.get("token")
        if tokens:
            return tokens[0]
    return None


def _get_jwks() -> dict[str, Any]:
    if not COGNITO_USER_POOL_ID:
        raise ValueError("COGNITO_USER_POOL_ID is required")
    url = (
        f"https://cognito-idp.{AWS_REGION}.amazonaws.com/"
        f"{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    )
    with urlopen(url, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def _validate_token(token: str) -> str:
    if ALLOW_DEV_BYPASS and token == "demo-token":
        return "demo-user"
    if jwt is None:
        raise ValueError("PyJWT not installed")

    jwks = _get_jwks()
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")
    key_data = next((k for k in jwks["keys"] if k["kid"] == kid), None)
    if not key_data:
        raise ValueError("JWT kid not found in Cognito JWKS")

    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key_data))
    decoded = jwt.decode(
        token,
        key=public_key,
        algorithms=["RS256"],
        audience=None,
        options={"verify_aud": False},
    )
    user_id = decoded.get("sub")
    if not user_id:
        raise ValueError("JWT missing sub claim")
    return str(user_id)


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    request_context = event.get("requestContext", {})
    connection_id = request_context.get("connectionId")
    if not connection_id:
        return json_body({"message": "Missing connection ID"}, 400)

    token = _parse_token(event)
    if not token:
        return json_body({"message": "Missing token query parameter"}, 401)

    try:
        user_id = _validate_token(token)
    except Exception as exc:  # noqa: BLE001
        return json_body({"message": f"Unauthorized: {exc}"}, 401)

    connections_table().put_item(
        Item={
            "userId": user_id,
            "connectionId": connection_id,
            "ttl": connection_ttl(),
        }
    )
    return json_body({"message": "Connected"})
