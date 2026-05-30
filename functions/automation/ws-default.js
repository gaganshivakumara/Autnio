// Dev 3 — WebSocket $default (message) handler
// Handles messages sent from the browser relay back to Lambda after
// Open Interpreter finishes a task. Forwards the result to the waiting caller.
//
// Message format from browser:
//   { type: "output" | "done", sessionId: string, data?: string }
//
// Env vars: DYNAMODB_TABLE, WEBSOCKET_API_ENDPOINT (injected by CDK in bin/autnio.ts)
// IAM: execute-api:ManageConnections granted by FunctionsStack

export const handler = async (event) => {
  return { statusCode: 200 };
};
