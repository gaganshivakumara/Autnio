import { ApifyClient } from 'apify-client';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

export const handler = async (event) => {
  try {
    const { query, type = 'search', maxResults } = parseBody(event);

    if (!query) return errorResponse(event, 400, 'Missing required field: query');

    const actorId =
      type === 'web' ? 'apify/web-scraper' : 'apify/google-search-scraper';

    const input =
      type === 'web'
        ? {
            startUrls: [{ url: query }],
            maxPagesPerCrawl: parseInt(maxResults ?? '5', 10),
          }
        : {
            queries: query,
            maxResultsPerQuery: parseInt(maxResults ?? '10', 10),
          };

    const run = await client.actor(actorId).call(input, { waitSecs: 90 });
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    const results = items.slice(0, 20).map((item) => ({
      title: item.title ?? item.url,
      url: item.url,
      snippet: (item.text ?? item.description ?? item.snippet ?? '').slice(0, 600),
    }));

    return bedrockResponse(event, 200, `Research complete: ${results.length} result(s)`, {
      query,
      results,
    });
  } catch (err) {
    return errorResponse(event, 500, err.message);
  }
};
