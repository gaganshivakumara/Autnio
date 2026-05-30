// Dev 2 — implement this handler
// Receives a task from Bedrock Agent, looks up the user's active WebSocket
// connection ID from DynamoDB (PK=CONNECTION#<userId>, SK=META), then pushes
// the task to the browser relay via API Gateway ManageConnections.
//
// Env vars: DYNAMODB_TABLE, WEBSOCKET_API_ENDPOINT (injected by CDK after WsStack deploy)
// IAM: execute-api:ManageConnections already granted by FunctionsStack
//
// Expected input from Bedrock Agent action group:
//   { task: string, userId: string, sessionId?: string }
//
// Returns:
//   { statusCode: 200, body: { result: "Task dispatched", data: {} } }
//   { statusCode: 503, body: { message: "Open Interpreter not connected" } }

exports.handler = async (event) => {
  throw new Error('Not implemented — Dev 2 owns this function');
};
