// Dev 3 — WebSocket $disconnect handler
// Called when a browser client disconnects. Removes the connection record
// from DynamoDB so stale connection IDs are not used by the dispatch Lambda.
//
// DynamoDB: delete item where PK=CONNECTION#<userId>, SK=META
// connectionId is in event.requestContext.connectionId
//
// Env vars: DYNAMODB_TABLE
// IAM: dynamodb:DeleteItem granted via table.grantReadWriteData in FunctionsStack

exports.handler = async (event) => {
  return { statusCode: 200 };
};
