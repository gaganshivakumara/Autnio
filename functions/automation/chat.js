// Dev 3 — Bedrock Agent proxy for POST /chat
// Receives a user message (text or voice transcript), forwards it to the
// Bedrock Agent, and streams the response back to the caller.
//
// Env vars: BEDROCK_AGENT_ID, BEDROCK_AGENT_ALIAS_ID (injected by CDK in bin/autnio.ts)
//           APP_ENV, COGNITO_USER_POOL_ID
// IAM: bedrock:InvokeAgent already granted by FunctionsStack
//
// Expected input (API Gateway proxy event body):
//   { message: string, sessionId?: string }
// userId extracted from JWT: event.requestContext.authorizer.claims.sub
//
// Returns:
//   { statusCode: 200, body: { result: <agent response text>, data: { sessionId } } }

exports.handler = async (event) => {
  throw new Error('Not implemented — Dev 3 owns this function (Bedrock Agent proxy)');
};
