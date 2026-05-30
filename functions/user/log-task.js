import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../shared/dynamodb.js';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

const NINETY_DAYS_SECS = 90 * 24 * 60 * 60;

export const handler = async (event) => {
  try {
    const { action, result, servicesUsed } = parseBody(event);
    const userId = event.sessionAttributes?.userId;

    if (!userId) return errorResponse(event, 401, 'Missing userId in session attributes');
    if (!action) return errorResponse(event, 400, 'Missing required field: action');

    const timestamp = new Date().toISOString();

    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `USER#${userId}`,
          SK: `LOG#${timestamp}`,
          action,
          result: result ?? null,
          servicesUsed: servicesUsed
            ? servicesUsed.split(',').map((s) => s.trim())
            : [],
          ttl: Math.floor(Date.now() / 1000) + NINETY_DAYS_SECS,
        },
      }),
    );

    return bedrockResponse(event, 200, 'Task logged', { timestamp });
  } catch (err) {
    return errorResponse(event, 500, err.message);
  }
};
