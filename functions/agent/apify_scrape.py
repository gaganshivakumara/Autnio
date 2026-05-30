from bedrock_util import agent_response, parse_body


def handler(event, context):
    body = parse_body(event)
    actor_id = body.get("actorId", "")
    return agent_response(
        event,
        200,
        {
            "result": f"Apify scrape stub — actor {actor_id} not yet wired",
            "data": {"status": "pending_dev2", "actorId": actor_id},
        },
    )
