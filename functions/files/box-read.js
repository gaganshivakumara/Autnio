// Handles both REST (GET /files?fileId=xxx) and Bedrock Agent action group events.
import BoxSDK from 'box-node-sdk';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

function getBoxClient() {
  return BoxSDK.getPreconfiguredInstance(JSON.parse(process.env.BOX_CONFIG_JSON)).getAppAuthClient(
    'user',
    process.env.BOX_USER_ID,
  );
}

function isBedrock(event) { return Boolean(event.actionGroup); }

export const handler = async (event) => {
  try {
    const fileId = isBedrock(event)
      ? parseBody(event).fileId
      : (event.queryStringParameters?.fileId ?? parseBody(event).fileId);

    if (!fileId) {
      const msg = 'Missing required field: fileId';
      return isBedrock(event)
        ? errorResponse(event, 400, msg)
        : { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) };
    }

    const client = getBoxClient();

    const info = await client.files.get(fileId, { fields: 'name,size,modified_at' });

    // Collect the read stream into a buffer
    const stream = await client.files.getReadStream(fileId, null);
    const chunks = [];
    await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    const content = Buffer.concat(chunks).toString('utf8').slice(0, 50_000); // cap at 50 KB

    return isBedrock(event)
      ? bedrockResponse(event, 200, `File "${info.name}" retrieved`, { fileId, name: info.name, size: info.size, content })
      : { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result: `File "${info.name}" retrieved`, data: { fileId, name: info.name, size: info.size, content } }) };
  } catch (err) {
    return isBedrock(event)
      ? errorResponse(event, 500, err.message)
      : { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: err.message }) };
  }
};
