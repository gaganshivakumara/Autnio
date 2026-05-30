import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../shared/dynamodb.js';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

export const handler = async (event) => {
  try {
    const { routineName, steps, trigger } = parseBody(event);
    const userId = event.sessionAttributes?.userId;

    if (!userId) return errorResponse(event, 401, 'Missing userId in session attributes');
    if (!routineName || !steps) {
      return errorResponse(event, 400, 'Missing required fields: routineName, steps');
    }

    const parsedSteps = typeof steps === 'string' ? JSON.parse(steps) : steps;

    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `USER#${userId}`,
          SK: `ROUTINE#${routineName}`,
          steps: parsedSteps,
          trigger: trigger ?? null,
          lastRun: null,
          createdAt: new Date().toISOString(),
        },
      }),
    );

    return bedrockResponse(event, 200, `Routine "${routineName}" saved`, {
      routineName,
      stepCount: parsedSteps.length,
    });
  } catch (err) {
    return errorResponse(event, 500, err.message);
  }
};
