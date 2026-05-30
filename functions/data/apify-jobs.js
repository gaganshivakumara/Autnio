import { ApifyClient } from 'apify-client';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
const JOB_BOARD_ACTOR = process.env.APIFY_JOBS_ACTOR ?? 'curious_coder/indeed-scraper';

export const handler = async (event) => {
  try {
    const { keywords, location, limit, remote } = parseBody(event);

    if (!keywords) return errorResponse(event, 400, 'Missing required field: keywords');

    const run = await client.actor(JOB_BOARD_ACTOR).call(
      {
        queries: keywords,
        location: location ?? '',
        maxResults: parseInt(limit ?? '20', 10),
        ...(remote === 'true' ? { remote: true } : {}),
      },
      { waitSecs: 120 },
    );

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    const jobs = items.map((j) => ({
      title: j.title ?? j.positionName,
      company: j.company ?? j.companyName,
      location: j.location,
      url: j.url ?? j.jobUrl,
      postedAt: j.postedAt ?? j.date,
      salary: j.salary ?? null,
      description: (j.description ?? '').slice(0, 500),
    }));

    return bedrockResponse(event, 200, `Found ${jobs.length} job(s) for "${keywords}"`, { jobs });
  } catch (err) {
    return errorResponse(event, 500, err.message);
  }
};
