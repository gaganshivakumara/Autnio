/**
 * Lambda handler — API Gateway entry point for all agent interactions.
 * Validates Cognito JWT, injects user profile into session state,
 * invokes Bedrock Agent, and persists session log to DynamoDB.
 */
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const bedrock = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE = process.env.DYNAMODB_TABLE ?? 'autnio-main';

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: 'access',
  clientId: process.env.COGNITO_CLIENT_ID,
});

export const handler = async (event) => {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body ?? event);
    const { prompt, sessionId } = body;

    const authHeader = event.headers?.Authorization ?? event.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return unauthorized('Missing or invalid Authorization header');
    }

    const claims = await verifier.verify(authHeader.slice(7));
    const userId = claims.sub;

    if (!prompt) {
      return respond(400, { message: 'Missing required field: prompt' });
    }

    const profileResult = await ddb.send(
      new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: 'PROFILE' } }),
    );
    const profile = profileResult.Item ?? {};
    const prefs = profile.preferences ?? {};

    const agentSessionId = sessionId ?? `${userId}-${Date.now()}`;

    const agentCommand = new InvokeAgentCommand({
      agentId: process.env.BEDROCK_AGENT_ID,
      agentAliasId: process.env.BEDROCK_AGENT_ALIAS_ID,
      sessionId: agentSessionId,
      inputText: prompt,
      sessionState: {
        sessionAttributes: {
          userId,
          userName: profile.name ?? '',
          userEmail: profile.email ?? '',
          userTimezone: prefs.timezone ?? 'UTC',
        },
        promptSessionAttributes: {
          userPreferences: JSON.stringify(prefs),
        },
      },
    });

    const agentResponse = await bedrock.send(agentCommand);

    const chunks = [];
    for await (const chunk of agentResponse.completion) {
      if (chunk.chunk?.bytes) {
        chunks.push(Buffer.from(chunk.chunk.bytes).toString('utf8'));
      }
    }
    const responseText = chunks.join('');

    // Log session entry with 24-hour TTL
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `USER#${userId}`,
          SK: `SESSION#${new Date().toISOString()}`,
          agentSessionId,
          summary: prompt.slice(0, 200),
          ttl: Math.floor(Date.now() / 1000) + 86_400,
        },
      }),
    );

    return respond(200, { response: responseText, sessionId: agentSessionId });
  } catch (err) {
    if (err.name === 'JwtExpiredError' || err.name === 'JwtInvalidClaimError') {
      return unauthorized('Invalid or expired token');
    }
    console.error(err);
    return respond(500, { message: err.message });
  }
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function unauthorized(message) {
  return respond(401, { message });
}
