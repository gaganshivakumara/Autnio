// Cognito post-confirmation trigger.
// Creates an initial USER#<sub> PROFILE item in DynamoDB on first sign-up.
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../shared/dynamodb.js';

export const handler = async (event) => {
  try {
    const sub = event.userName;
    const attrs = event.request?.userAttributes ?? {};

    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `USER#${sub}`,
          SK: 'PROFILE',
          name: attrs.name ?? '',
          email: attrs.email ?? '',
          preferences: {
            timezone: 'UTC',
            communicationStyle: 'concise',
          },
          createdAt: new Date().toISOString(),
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  } catch (err) {
    // ConditionalCheckFailedException = profile already exists, safe to ignore
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  }

  return event; // Cognito trigger must return the event object
};
