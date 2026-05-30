// Bedrock action: POST /product-discovery
// Lightweight, demo-oriented Amazon product lookup via the Apify MCP server.
//
// Flow: take a short (<= 5 word) search description, search Amazon, scrape ONLY
// the first result, and return a compact summary + a ready-to-speak narration.
//
// COST GUARD (hard rule): never scrape data older than 6 months. Reviews dated
// before the cutoff are dropped, and we only ever pull the single top result.
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';
import { runActor } from '../shared/apify-mcp.js';

const PRODUCT_ACTOR = process.env.APIFY_PRODUCT_ACTOR ?? 'junglee/amazon-crawler';
const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000;
const CUTOFF = () => Date.now() - SIX_MONTHS_MS;

export const handler = async (event) => {
  try {
    const { query, maxReviews } = parseBody(event);

    if (!query) return errorResponse(event, 400, 'Missing required field: query');

    // Keep the search cheap and predictable: trim to <= 5 words.
    const search = String(query).trim().split(/\s+/).slice(0, 5).join(' ');
    const reviewLimit = Math.min(parseInt(maxReviews ?? '3', 10), 5);

    // Amazon search; scrape only the first result to keep cost down.
    const items = await runActor(
      PRODUCT_ACTOR,
      { keywords: [search], maxItems: 1, maxReviews: reviewLimit },
      { maxItems: 1 },
    );

    if (!items.length) {
      return bedrockResponse(event, 200, `I couldn't find anything on Amazon for "${search}".`, {
        query: search,
        found: false,
      });
    }

    const data = mapProduct(items[0], reviewLimit);
    const spoken = narrate(data);

    return bedrockResponse(event, 200, spoken, { query: search, found: true, ...data });
  } catch (err) {
    return errorResponse(event, 500, err.message);
  }
};

function mapProduct(p, reviewLimit) {
  return {
    name: p.title ?? p.name ?? p.productName ?? 'this product',
    price: p.price?.value ? `${p.price.currency ?? '$'}${p.price.value}` : (p.price ?? null),
    rating: numeric(p.rating ?? p.stars ?? p.averageRating),
    reviewCount: numeric(p.reviewsCount ?? p.reviewCount ?? p.ratingsTotal),
    availability: p.availability ?? p.inStock ?? null,
    pros: arr(p.pros ?? p.highlights),
    cons: arr(p.cons),
    topReviews: recentReviews(p.reviews ?? p.topReviews ?? [], reviewLimit),
    url: p.url ?? p.link ?? null,
  };
}

// Spoken narration: confirmation → 3–4 sentence summary → invite.
function narrate(d) {
  const parts = [`I now have all the information about ${d.name}.`];

  if (d.rating) {
    parts.push(
      `It averages ${d.rating} stars${d.reviewCount ? ` across about ${d.reviewCount} reviews` : ''}${d.price ? `, and costs around ${d.price}` : ''}.`,
    );
  } else if (d.price) {
    parts.push(`It costs around ${d.price}.`);
  }
  if (d.pros.length) parts.push(`People like its ${d.pros.slice(0, 2).join(' and ')}.`);
  if (d.cons.length) parts.push(`The most common complaint is ${d.cons[0]}.`);
  if (d.availability) parts.push(`It's currently ${d.availability}.`);

  parts.push('You can now ask questions about the product.');
  return parts.join(' ');
}

// Hard 6-month rule: drop reviews dated before the cutoff, then cap the count.
function recentReviews(reviews, limit) {
  const cutoff = CUTOFF();
  return reviews
    .filter((r) => {
      const ts = Date.parse(r.date ?? r.reviewDate ?? r.createdAt ?? '');
      return Number.isNaN(ts) ? false : ts >= cutoff;
    })
    .slice(0, limit)
    .map((r) => ({
      rating: r.rating ?? r.stars ?? null,
      date: r.date ?? r.reviewDate ?? r.createdAt ?? null,
      text: (r.text ?? r.review ?? r.body ?? '').slice(0, 300),
    }));
}

const numeric = (v) => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const arr = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);
