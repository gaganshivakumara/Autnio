// REST handler: POST /files
// Uploads a new version of an existing Box file (overwrites content).
import BoxSDK from 'box-node-sdk';

function getBoxClient() {
  return BoxSDK.getPreconfiguredInstance(JSON.parse(process.env.BOX_CONFIG_JSON)).getAppAuthClient(
    'user',
    process.env.BOX_USER_ID,
  );
}

export const handler = async (event) => {
  try {
    const { fileId, content } = typeof event.body === 'string'
      ? JSON.parse(event.body || '{}')
      : (event.body ?? {});

    if (!fileId || !content) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Missing required fields: fileId, content' }) };
    }

    const client = getBoxClient();
    const buffer = Buffer.from(content, 'utf8');
    const updated = await client.files.uploadNewFileVersion(fileId, buffer);
    const entry = updated.entries[0];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: `File ${fileId} updated`, data: { fileId: entry.id, versionId: entry.file_version?.id } }),
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: err.message }) };
  }
};
