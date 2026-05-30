// Handles both REST (PUT /profile) and Bedrock Agent action group events.
// Merges preferences and/or sessionState into the existing profile item.
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../shared/dynamodb.js';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

function isBedrock(event) { return Boolean(event.actionGroup); }

export const handler = async (event) => {
  try {
    const userId = isBedrock(event)
      ? event.sessionAttributes?.userId
      : event.requestContext?.authorizer?.claims?.sub;

    if (!userId) {
      const msg = 'Unable to determine userId';
      return isBedrock(event)
        ? errorResponse(event, 401, msg)
        : { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) };
    }

    const body = isBedrock(event)
      ? parseBody(event)
      : (typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body ?? {}));

    const { preferences, sessionState } = body;

    if (!preferences && !sessionState) {
      const msg = 'Provide at least one of: preferences, sessionState';
      return isBedrock(event)
        ? errorResponse(event, 400, msg)
        : { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) };
    }

    const existing = await ddb.send(
      new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: 'PROFILE' } }),
    );
    const item = existing.Item ?? { PK: `USER#${userId}`, SK: 'PROFILE' };

    if (preferences) {
      const parsed = typeof preferences === 'string' ? JSON.parse(preferences) : preferences;
      item.preferences = { ...(item.preferences ?? {}), ...parsed };
    }
    if (sessionState) {
      const parsed = typeof sessionState === 'string' ? JSON.parse(sessionState) : sessionState;
      item.sessionState = { ...(item.sessionState ?? {}), ...parsed };
    }
    item.updatedAt = new Date().toISOString();

    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

    return isBedrock(event)
      ? bedrockResponse(event, 200, 'Profile updated', {})
      : { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result: 'Profile updated', data: {} }) };
  } catch (err) {
    return isBedrock(event)
      ? errorResponse(event, 500, err.message)
      : { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: err.message }) };
  }
};
