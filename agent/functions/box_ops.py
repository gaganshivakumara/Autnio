from __future__ import annotations

import os

from bedrock_util import agent_response, parse_body

BOX_CLIENT_ID = os.environ.get("BOX_CLIENT_ID", "")
BOX_CLIENT_SECRET = os.environ.get("BOX_CLIENT_SECRET", "")
BOX_ENTERPRISE_ID = os.environ.get("BOX_ENTERPRISE_ID", "")


def handler(event, context):
    body = parse_body(event)
    api_path = event.get("apiPath", "")

    if not BOX_CLIENT_ID or not BOX_CLIENT_SECRET:
        return agent_response(
            event,
            200,
            {
                "result": "Box integration not configured",
                "message": "BOX_CLIENT_ID and BOX_CLIENT_SECRET must be set in Lambda environment.",
                "data": {"status": "not_configured", "path": api_path},
            },
        )

    # Placeholder for Box SDK integration (Dev 2 scope).
    return agent_response(
        event,
        200,
        {
            "result": f"Box {api_path} — pending full integration",
            "data": {"status": "pending_dev2", "request": body},
        },
    )
