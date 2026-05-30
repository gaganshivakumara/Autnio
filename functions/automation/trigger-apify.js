// REST handler: POST /automation/apify
// Starts an Apify actor run immediately and returns the run ID without waiting.
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

export const handler = async (event) => {
  try {
    const { actorId, input } = typeof event.body === 'string'
      ? JSON.parse(event.body || '{}')
      : (event.body ?? {});

    if (!actorId) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Missing required field: actorId' }) };
    }

    const run = await client.actor(actorId).start(input ?? {});

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: run.id, status: run.status, actorId }),
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: err.message }) };
  }
};
