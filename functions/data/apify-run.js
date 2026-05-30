import { ApifyClient } from 'apify-client';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

export const handler = async (event) => {
  try {
    const { actorId, input, waitSecs } = parseBody(event);

    if (!actorId) return errorResponse(event, 400, 'Missing required field: actorId');

    const parsedInput = typeof input === 'string' ? JSON.parse(input) : (input ?? {});

    const run = await client.actor(actorId).call(parsedInput, {
      waitSecs: parseInt(waitSecs ?? '60', 10),
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    return bedrockResponse(event, 200, `Actor ${actorId} completed with ${items.length} item(s)`, {
      runId: run.id,
      status: run.status,
      itemCount: items.length,
      items: items.slice(0, 50), // cap to stay within Lambda response size limits
    });
  } catch (err) {
    return errorResponse(event, 500, err.message);
  }
};
