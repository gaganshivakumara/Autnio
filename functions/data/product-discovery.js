// Bedrock action: POST /product-discovery
// Two-step, demo-scoped Amazon lookup via Apify (REST run-sync):
//   1. PRODUCT search — APIFY_PRODUCT_ACTOR (junglee/free-amazon-product-scraper),
//      first result only.
//   2. REVIEWS — APIFY_REVIEW_ACTOR (web_wanderer/amazon-reviews-extractor),
//      restricted to the last 6 months.
// Returns a compact summary + a ready-to-speak narration.
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

const TOKEN = process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN;
const PRODUCT_ACTOR = process.env.APIFY_PRODUCT_ACTOR ?? 'XVDTQc4a7MDTqSTMJ';
const REVIEW_ACTOR = process.env.APIFY_REVIEW_ACTOR ?? 'gFtgG31RZJYlphznm';
const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000;
const ASIN_RE = /\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{10})/;

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? event.httpMethod;
  if (method === 'OPTIONS') return bedrockResponse(event, 200, 'OK', {});

  try {
    const { query } = parseBody(event);
    if (!query) return errorResponse(event, 400, 'Missing required field: query');
    if (!TOKEN) {
      return bedrockResponse(event, 200, 'Apify integration not configured', { status: 'not_configured' });
    }

    const search = String(query).trim().split(/\s+/).slice(0, 5).join(' ');

    // 1. Product search — first result only.
    const products = await runSync(PRODUCT_ACTOR, {
      categoryUrls: [{ url: `https://www.amazon.com/s?k=${encodeURIComponent(search)}` }],
      maxItemsPerStartUrl: 1,
      maxSearchPagesPerStartUrl: 1,
    }, 1);

    if (!products.length) {
      return bedrockResponse(event, 200, `I couldn't find anything on Amazon for "${search}".`, { query: search, found: false });
    }

    const product = mapProduct(products[0]);

    // 2. Reviews — last 6 months only.
    const now = Date.now();
    const cutoff = now - SIX_MONTHS_MS;
    const asin = product.asin ?? extractAsin(product.url);
    if (asin) {
      try {
        const raw = await runSync(REVIEW_ACTOR, {
          products: [asin],
          limit: 10,
          sort: 'recent',
          start_date: isoDate(cutoff),
          end_date: isoDate(now),
        }, 10);
        product.topReviews = recentReviews(raw, cutoff, 5);
      } catch {
        product.topReviews = [];
      }
    } else {
      product.topReviews = [];
    }

    return bedrockResponse(event, 200, narrate(product), { query: search, found: true, asin, ...product });
  } catch (err) {
    return errorResponse(event, 500, err.message);
  }
};

async function runSync(actorId, input, limit) {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${TOKEN}&limit=${limit}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify actor ${actorId} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function mapProduct(p) {
  return {
    name: p.title ?? p.name ?? p.productTitle ?? 'this product',
    asin: p.asin ?? p.ASIN ?? null,
    price: p.price?.value ? `${p.price.currency ?? '$'}${p.price.value}` : (p.price ?? null),
    rating: numeric(p.stars ?? p.rating ?? p.averageRating),
    reviewCount: numeric(p.reviewsCount ?? p.reviewCount ?? p.ratingsTotal),
    availability: p.availability ?? p.inStock ?? null,
    url: p.url ?? p.link ?? p.productUrl ?? null,
  };
}

function extractAsin(url) {
  if (!url) return null;
  const m = ASIN_RE.exec(String(url));
  return m ? m[1] : null;
}

// Keep only reviews dated within the last 6 months (belt-and-braces over start_date).
function recentReviews(reviews, cutoff, limit) {
  const out = [];
  for (const r of reviews) {
    const ts = Date.parse(r.date ?? r.reviewDate ?? r.reviewedAt ?? r.createdAt ?? '');
    if (!Number.isNaN(ts) && ts < cutoff) continue;
    out.push({
      rating: numeric(r.rating ?? r.stars ?? r.reviewStars),
      date: r.date ?? r.reviewDate ?? r.reviewedAt ?? r.createdAt ?? null,
      title: r.title ?? r.reviewTitle ?? null,
      text: (r.text ?? r.reviewText ?? r.reviewDescription ?? r.body ?? '').slice(0, 300),
    });
    if (out.length >= limit) break;
  }
  return out;
}

function narrate(d) {
  const parts = [`I now have all the information about ${d.name}.`];
  if (d.rating) {
    parts.push(`It averages ${d.rating} stars${d.reviewCount ? ` across about ${d.reviewCount} ratings` : ''}${d.price ? `, and it costs around ${d.price}` : ''}.`);
  } else if (d.price) {
    parts.push(`It costs around ${d.price}.`);
  }
  const reviews = d.topReviews ?? [];
  if (reviews.length) {
    const scores = reviews.map((r) => r.rating).filter(Boolean);
    if (scores.length) {
      const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      const mood = avg >= 4 ? 'mostly positive' : avg >= 3 ? 'mixed' : 'mostly negative';
      parts.push(`Reviews from the last six months are ${mood}, averaging ${avg} stars.`);
    }
    const snippet = reviews.find((r) => r.text)?.text;
    if (snippet) parts.push(`One recent reviewer said: ${snippet}`);
  } else {
    parts.push("I couldn't find any reviews from the last six months.");
  }
  parts.push('You can now ask questions about the product.');
  return parts.join(' ');
}

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const numeric = (v) => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
};
