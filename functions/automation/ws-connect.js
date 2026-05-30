// WebSocket $connect handler
// Stores the connection ID in DynamoDB so the dispatch Lambda can push tasks
// to this user's browser relay.
//
// DynamoDB schema (single-table):
//   PK = CONNECTION#anonymous
//   SK = META
//   connectionId = <event.requestContext.connectionId>
//   ttl = Math.floor(Date.now() / 1000) + 86400  (24h TTL)
//
// Env vars: DYNAMODB_TABLE
// IAM: dynamodb:PutItem granted via table.grantReadWriteData in FunctionsStack

import { ddb, TABLE } from '../shared/dynamodb.js';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

export const handler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK: 'CONNECTION#anonymous',
      SK: 'META',
      connectionId,
      ttl: Math.floor(Date.now() / 1000) + 86400,
    },
  }));

  return { statusCode: 200 };
};
