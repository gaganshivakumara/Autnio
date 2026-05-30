import BoxSDK from 'box-node-sdk';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

function getBoxClient() {
  return BoxSDK.getPreconfiguredInstance(JSON.parse(process.env.BOX_CONFIG_JSON)).getAppAuthClient(
    'user',
    process.env.BOX_USER_ID,
  );
}

export const handler = async (event) => {
  try {
    const { query, fileExtension, limit } = parseBody(event);

    if (!query) return errorResponse(event, 400, 'Missing required field: query');

    const client = getBoxClient();
    const results = await client.search.query(query, {
      limit: parseInt(limit ?? '10', 10),
      ...(fileExtension ? { file_extensions: [fileExtension] } : {}),
    });

    const files = results.entries.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      modifiedAt: f.modified_at,
      path: f.path_collection?.entries?.map((e) => e.name).join('/') ?? '',
    }));

    return bedrockResponse(event, 200, `Found ${files.length} file(s) for "${query}"`, { files });
  } catch (err) {
    return errorResponse(event, 500, err.message);
  }
};
