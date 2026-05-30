"""Amazon product discovery for the Bedrock Agent web-data action group.

Two-step, demo-scoped, cost-bounded Amazon lookup via Apify (REST run-sync):

  1. PRODUCT search  — actor APIFY_PRODUCT_ACTOR (junglee/free-amazon-product-scraper).
     Searches Amazon for the (<=5 word) query and scrapes ONLY the first result.
  2. REVIEW scrape   — actor APIFY_REVIEW_ACTOR (web_wanderer/amazon-reviews-extractor).
     Pulls reviews for that product, restricted to the LAST 6 MONTHS (start_date).

Then it returns a compact summary plus a ready-to-speak narration shaped as:

    "I now have all the information about <name>. <3-4 sentence summary>
     You can now ask questions about the product."

COST GUARD (hard rules): only the single top product is scraped, and reviews are
limited to the last 6 months (enforced via the actor's start_date AND re-filtered
client-side).
"""
from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from bedrock_util import agent_response, parse_body

APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
PRODUCT_ACTOR = os.environ.get("APIFY_PRODUCT_ACTOR", "XVDTQc4a7MDTqSTMJ")  # junglee/free-amazon-product-scraper
REVIEW_ACTOR = os.environ.get("APIFY_REVIEW_ACTOR", "gFtgG31RZJYlphznm")    # web_wanderer/amazon-reviews-extractor

_TOKEN_CONFIGURED = bool(APIFY_TOKEN) and not APIFY_TOKEN.startswith("REPLACE")
_SIX_MONTHS = timedelta(days=182)
_ASIN_RE = re.compile(r"/(?:dp|gp/product|product-reviews)/([A-Z0-9]{10})")


def handler(event: dict, context) -> dict:
    body = parse_body(event)
    query = body.get("query", "")
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

    # Keep the search cheap and predictable: at most 5 words.
    search = " ".join(str(query).split()[:5])

    # ── 1. Product search — first result only ──────────────────────────────
    try:
        products = _run_sync(
            PRODUCT_ACTOR,
            {
                "categoryUrls": [{"url": f"https://www.amazon.com/s?k={urllib.parse.quote(search)}"}],
                "maxItemsPerStartUrl": 1,
                "maxSearchPagesPerStartUrl": 1,
            },
            limit=1,
        )
    except Exception as exc:  # noqa: BLE001
        return agent_response(event, 200, {"result": f"Couldn't search Amazon for {search}", "message": str(exc), "data": {}})

    if not products:
        return agent_response(
            event,
            200,
            {"result": f"I couldn't find anything on Amazon for \"{search}\".", "data": {"query": search, "found": False}},
        )

    product = _map_product(products[0])

    # ── 2. Reviews — last 6 months only ────────────────────────────────────
    now = datetime.now(timezone.utc)
    cutoff = now - _SIX_MONTHS
    asin = product.get("asin") or _extract_asin(product.get("url"))
    if asin:
        try:
            raw_reviews = _run_sync(
                REVIEW_ACTOR,
                {
                    "products": [asin],
                    "limit": 10,
                    "sort": "recent",
                    "start_date": cutoff.strftime("%Y-%m-%d"),
                    "end_date": now.strftime("%Y-%m-%d"),
                },
                limit=10,
            )
            product["topReviews"] = _recent_reviews(raw_reviews, cutoff, 5)
        except Exception:  # noqa: BLE001 — reviews are best-effort
            product["topReviews"] = []
    else:
        product["topReviews"] = []

    spoken = _narrate(product)
    return agent_response(event, 200, {"result": spoken, "data": {"query": search, "found": True, "asin": asin, **product}})


def _run_sync(actor_id: str, run_input: dict, limit: int) -> list:
    """Run an actor synchronously and return its dataset items (Apify REST)."""
    url = f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items?token={APIFY_TOKEN}&limit={limit}"
    req = urllib.request.Request(
        url,
        data=json.dumps(run_input).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _map_product(p: dict) -> dict:
    price = p.get("price")
    if isinstance(price, dict):
        price = f"{price.get('currency', '$')}{price.get('value', '')}"
    return {
        "name": p.get("title") or p.get("name") or p.get("productTitle") or "this product",
        "asin": p.get("asin") or p.get("ASIN"),
        "price": price,
        "rating": _numeric(p.get("stars") or p.get("rating") or p.get("averageRating")),
        "reviewCount": _numeric(p.get("reviewsCount") or p.get("reviewCount") or p.get("ratingsTotal")),
        "availability": p.get("availability") or p.get("inStock"),
        "url": p.get("url") or p.get("link") or p.get("productUrl"),
    }


def _extract_asin(url) -> str | None:
    if not url:
        return None
    m = _ASIN_RE.search(str(url))
    return m.group(1) if m else None


def _recent_reviews(reviews: list, cutoff: datetime, limit: int) -> list:
    """Keep only reviews dated within the last 6 months (belt-and-braces)."""
    kept = []
    for r in reviews:
        ts = _parse_date(r.get("date") or r.get("reviewDate") or r.get("reviewedAt") or r.get("createdAt"))
        if ts is not None and ts < cutoff:
            continue  # older than 6 months → drop
        kept.append({
            "rating": _numeric(r.get("rating") or r.get("stars") or r.get("reviewStars")),
            "date": r.get("date") or r.get("reviewDate") or r.get("reviewedAt") or r.get("createdAt"),
            "title": r.get("title") or r.get("reviewTitle"),
            "text": (r.get("text") or r.get("reviewText") or r.get("reviewDescription") or r.get("body") or "")[:300],
        })
        if len(kept) >= limit:
            break
    return kept


def _parse_date(value):
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    # Try ISO first, then a few common Amazon formats.
    try:
        dt = datetime.fromisoformat(text)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    for fmt in ("%B %d, %Y", "%d %B %Y", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _narrate(d: dict) -> str:
    parts = [f"I now have all the information about {d['name']}."]

    if d.get("rating"):
        count = f" across about {d['reviewCount']} ratings" if d.get("reviewCount") else ""
        price = f", and it costs around {d['price']}" if d.get("price") else ""
        parts.append(f"It averages {d['rating']} stars{count}{price}.")
    elif d.get("price"):
        parts.append(f"It costs around {d['price']}.")

    reviews = d.get("topReviews") or []
    if reviews:
        recent_scores = [r["rating"] for r in reviews if r.get("rating")]
        if recent_scores:
            avg = round(sum(recent_scores) / len(recent_scores), 1)
            mood = "mostly positive" if avg >= 4 else "mixed" if avg >= 3 else "mostly negative"
            parts.append(f"Reviews from the last six months are {mood}, averaging {avg} stars.")
        snippet = next((r["text"] for r in reviews if r.get("text")), "")
        if snippet:
            parts.append(f"One recent reviewer said: {snippet}")
    else:
        parts.append("I couldn't find any reviews from the last six months.")

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
