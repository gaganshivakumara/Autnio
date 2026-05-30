// REST handler: GET /automation/apify/{runId}
// Checks the status of an Apify run and returns results if it has finished.
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

export const handler = async (event) => {
  try {
    const runId = event.pathParameters?.runId
      ?? (typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body ?? {})).runId;

    if (!runId) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Missing runId' }) };
    }

    const run = await client.run(runId).get();
    let items = [];

    if (run.status === 'SUCCEEDED') {
      const dataset = await client.dataset(run.defaultDatasetId).listItems({ limit: 50 });
      items = dataset.items;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId,
        status: run.status,
        itemCount: run.stats?.itemCount ?? items.length,
        items,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: err.message }) };
  }
};
