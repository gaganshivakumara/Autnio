from __future__ import annotations

import os

import boto3

from bedrock_util import agent_response, parse_body
import product_discovery

APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
_TOKEN_CONFIGURED = bool(APIFY_TOKEN) and not APIFY_TOKEN.startswith("REPLACE")


def handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod")
    if method == "OPTIONS":
        return agent_response(event, 200, {})

    # The web-data action group routes by apiPath; product/place discovery is
    # handled by its own module, everything else is a raw actor run.
    path = (event.get("apiPath") or event.get("rawPath") or "").rstrip("/")
    if path == "/product-discovery" or (not event.get("actionGroup") and event.get("body")):
        return product_discovery.handler(event, context)

    body = parse_body(event)
    actor_id = body.get("actorId", "")
    run_input = body.get("runInput", {})

    if not _TOKEN_CONFIGURED:
        return agent_response(
            event,
            200,
            {
                "result": "Apify integration not configured",
                "message": "APIFY_TOKEN environment variable is not set. "
                           "Set it in the Lambda configuration to enable web scraping.",
                "data": {"status": "not_configured"},
            },
        )

    if not actor_id:
        return agent_response(
            event,
            400,
            {"result": "actorId is required", "data": {}},
        )

    # Invoke Apify actor via REST API.
    import json
    import urllib.request

    url = f"https://api.apify.com/v2/acts/{actor_id}/runs?token={APIFY_TOKEN}"
    data = json.dumps(run_input).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        run_id = result.get("data", {}).get("id", "")
        return agent_response(
            event,
            200,
            {
                "result": "Apify actor started",
                "data": {"runId": run_id, "actorId": actor_id},
            },
        )
    except Exception as exc:  # noqa: BLE001
        return agent_response(
            event,
            200,
            {
                "result": "Apify actor failed to start",
                "message": str(exc),
                "data": {"actorId": actor_id},
            },
        )
