// Handles both REST (GET /profile) and Bedrock Agent action group events.
// REST: userId from JWT claim (event.requestContext.authorizer.claims.sub)
// Bedrock: userId from event.sessionAttributes.userId
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../shared/dynamodb.js';
import { bedrockResponse, errorResponse } from '../shared/response.js';

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

    const result = await ddb.send(
      new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: 'PROFILE' } }),
    );

    if (!result.Item) {
      const msg = 'Profile not found';
      return isBedrock(event)
        ? errorResponse(event, 404, msg)
        : { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) };
    }

    const { PK, SK, ...profile } = result.Item;

    return isBedrock(event)
      ? bedrockResponse(event, 200, 'Profile loaded', { profile })
      : { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result: 'Profile loaded', data: { profile } }) };
  } catch (err) {
    return isBedrock(event)
      ? errorResponse(event, 500, err.message)
      : { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: err.message }) };
  }
};
