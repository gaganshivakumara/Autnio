import BoxSDK from 'box-node-sdk';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../shared/dynamodb.js';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

function getBoxClient() {
  return BoxSDK.getPreconfiguredInstance(JSON.parse(process.env.BOX_CONFIG_JSON)).getAppAuthClient(
    'user',
    process.env.BOX_USER_ID,
  );
}

export const handler = async (event) => {
  try {
    const { fileName, content, folderId } = parseBody(event);
    const userId = event.sessionAttributes?.userId;

    if (!fileName || !content) {
      return errorResponse(event, 400, 'Missing required fields: fileName, content');
    }

    const client = getBoxClient();
    const targetFolder = folderId ?? '0';
    const buffer = Buffer.from(content, 'utf8');
    const uploaded = await client.files.uploadFile(targetFolder, fileName, buffer);
    const fileId = uploaded.entries[0].id;

    if (userId) {
      await ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: `USER#${userId}`,
            SK: `FILE#${fileId}`,
            name: fileName,
            folder: targetFolder,
            lastAccessed: new Date().toISOString(),
          },
        }),
      );
    }

    return bedrockResponse(event, 200, `File "${fileName}" uploaded to Box`, {
      fileId,
      fileName,
      folderId: targetFolder,
    });
  } catch (err) {
    return errorResponse(event, 500, err.message);
  }
};
