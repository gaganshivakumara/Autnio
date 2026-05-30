"""Lightweight Amazon product discovery for the Bedrock Agent web-data action group.

Demo-oriented: takes a short (<= 5 word) search description, searches Amazon via
the hosted Apify MCP server (mcp.apify.com), scrapes ONLY the first result, and
returns a compact summary plus a ready-to-speak narration shaped as:

    "I now have all the information about <name>. <3-4 sentence summary>
     You can now ask questions about the product."

COST GUARD (hard rule): never scrape data older than 6 months — reviews dated
before the cutoff are dropped and we only ever pull the single top result.

Falls back to the Apify REST API when APIFY_MCP_URL is not configured.
"""
from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone

from bedrock_util import agent_response, parse_body

APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
APIFY_MCP_URL = os.environ.get("APIFY_MCP_URL", "")
PRODUCT_ACTOR = os.environ.get("APIFY_PRODUCT_ACTOR", "junglee/amazon-crawler")

_TOKEN_CONFIGURED = bool(APIFY_TOKEN) and not APIFY_TOKEN.startswith("REPLACE")
_SIX_MONTHS = timedelta(days=182)


def handler(event: dict, context) -> dict:
    body = parse_body(event)
    query = body.get("query", "")
    try:
        max_reviews = min(int(body.get("maxReviews", 3)), 5)
    except (TypeError, ValueError):
        max_reviews = 3

    if not query:
        return agent_response(event, 400, {"result": "query is required", "data": {}})

    if not _TOKEN_CONFIGURED:
        return agent_response(
            event,
            200,
            {
                "result": "Apify integration not configured",
                "message": "APIFY_TOKEN is not set; cannot run product discovery.",
                "data": {"status": "not_configured"},
            },
        )

    # Keep the search cheap and predictable: trim to <= 5 words.
    search = " ".join(str(query).split()[:5])
    run_input = {"keywords": [search], "maxItems": 1, "maxReviews": max_reviews}

    try:
        items = _run_actor(PRODUCT_ACTOR, run_input)
    except Exception as exc:  # noqa: BLE001
        return agent_response(
            event,
            200,
            {"result": f"Discovery failed for {search}", "message": str(exc), "data": {}},
        )

    if not items:
        return agent_response(
            event,
            200,
            {"result": f"I couldn't find anything on Amazon for \"{search}\".", "data": {"query": search, "found": False}},
        )

    data = _map_product(items[0], max_reviews)
    spoken = _narrate(data)
    return agent_response(event, 200, {"result": spoken, "data": {"query": search, "found": True, **data}})


def _run_actor(actor_id: str, run_input: dict) -> list:
    if APIFY_MCP_URL:
        return _run_via_mcp(actor_id, run_input)
    return _run_via_rest(actor_id, run_input)


def _run_via_mcp(actor_id: str, run_input: dict) -> list:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": "call-actor", "arguments": {"actor": actor_id, "input": run_input, "maxItems": 1}},
    }
    req = urllib.request.Request(
        APIFY_MCP_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {APIFY_TOKEN}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = resp.read().decode("utf-8")
    return _extract_items(_parse_rpc(body))


def _run_via_rest(actor_id: str, run_input: dict) -> list:
    base = f"https://api.apify.com/v2/acts/{actor_id.replace('/', '~')}"
    url = f"{base}/run-sync-get-dataset-items?token={APIFY_TOKEN}&limit=1"
    req = urllib.request.Request(
        url,
        data=json.dumps(run_input).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _parse_rpc(text: str) -> dict:
    text = text.strip()
    if text.startswith("{"):
        return json.loads(text).get("result", {})
    for line in reversed(text.split("\n")):
        if line.startswith("data:"):
            try:
                obj = json.loads(line[5:].strip())
                if "result" in obj:
                    return obj["result"]
            except json.JSONDecodeError:
                continue
    return {}


def _extract_items(result: dict) -> list:
    if not result:
        return []
    structured = (result.get("structuredContent") or {}).get("items")
    if isinstance(structured, list):
        return structured[:1]
    items = []
    for block in result.get("content") or []:
        if block.get("type") == "text" and block.get("text"):
            try:
                parsed = json.loads(block["text"])
                items.extend(parsed if isinstance(parsed, list) else [parsed])
            except json.JSONDecodeError:
                continue
    return items[:1]


def _map_product(p: dict, max_reviews: int) -> dict:
    price = p.get("price")
    if isinstance(price, dict):
        price = f"{price.get('currency', '$')}{price.get('value', '')}"
    return {
        "name": p.get("title") or p.get("name") or "this product",
        "price": price,
        "rating": _numeric(p.get("rating") or p.get("stars") or p.get("averageRating")),
        "reviewCount": _numeric(p.get("reviewsCount") or p.get("reviewCount") or p.get("ratingsTotal")),
        "availability": p.get("availability") or p.get("inStock"),
        "pros": _arr(p.get("pros") or p.get("highlights")),
        "cons": _arr(p.get("cons")),
        "topReviews": _recent_reviews(p.get("reviews") or p.get("topReviews") or [], max_reviews),
        "url": p.get("url") or p.get("link"),
    }


def _recent_reviews(reviews: list, limit: int) -> list:
    """Hard 6-month rule: keep only reviews dated within the last 6 months."""
    cutoff = datetime.now(timezone.utc) - _SIX_MONTHS
    kept = []
    for r in reviews:
        ts = _parse_date(r.get("date") or r.get("reviewDate") or r.get("createdAt"))
        if ts is None or ts < cutoff:
            continue
        kept.append({
            "rating": r.get("rating") or r.get("stars"),
            "date": r.get("date") or r.get("reviewDate") or r.get("createdAt"),
            "text": (r.get("text") or r.get("review") or r.get("body") or "")[:300],
        })
        if len(kept) >= limit:
            break
    return kept


def _parse_date(value):
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _narrate(d: dict) -> str:
    parts = [f"I now have all the information about {d['name']}."]
    if d.get("rating"):
        count = f" across about {d['reviewCount']} reviews" if d.get("reviewCount") else ""
        price = f", and costs around {d['price']}" if d.get("price") else ""
        parts.append(f"It averages {d['rating']} stars{count}{price}.")
    elif d.get("price"):
        parts.append(f"It costs around {d['price']}.")
    if d.get("pros"):
        parts.append(f"People like its {' and '.join(d['pros'][:2])}.")
    if d.get("cons"):
        parts.append(f"The most common complaint is {d['cons'][0]}.")
    if d.get("availability"):
        parts.append(f"It's currently {d['availability']}.")
    parts.append("You can now ask questions about the product.")
    return " ".join(parts)


def _numeric(v):
    if v is None:
        return None
    digits = "".join(c for c in str(v) if c.isdigit() or c == ".")
    try:
        return float(digits) if digits else None
    except ValueError:
        return None


def _arr(v) -> list:
    return [str(x) for x in v if x] if isinstance(v, list) else []
