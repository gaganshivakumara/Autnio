// Dev 3 — WebSocket $connect handler
// Called when a browser client connects to the WebSocket API.
// Stores the connection ID in DynamoDB so the dispatch Lambda can push tasks
// to this user's browser relay.
//
// DynamoDB schema (single-table):
//   PK = CONNECTION#<userId>
//   SK = META
//   connectionId = <event.requestContext.connectionId>
//   ttl = Math.floor(Date.now() / 1000) + 86400  (24h TTL)
//
// The JWT token is passed as a query string param: wss://...?token=<id_token>
// Validate it and extract the userId (sub claim) before writing to DynamoDB.
//
// Env vars: DYNAMODB_TABLE
// IAM: dynamodb:PutItem granted via table.grantReadWriteData in FunctionsStack

export const handler = async (event) => {
  return { statusCode: 200 };
};
