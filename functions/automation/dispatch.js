// Receives a task from the Bedrock Agent, looks up the user's active WebSocket
// connection ID from DynamoDB (PK=CONNECTION#<userId>, SK=META), then pushes
// the task to the browser relay via API Gateway ManageConnections.
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../shared/dynamodb.js';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

export const handler = async (event) => {
  try {
    const { task, sessionId } = parseBody(event);
    const userId = event.sessionAttributes?.userId;

    if (!userId) return errorResponse(event, 401, 'Missing userId in session attributes');
    if (!task) return errorResponse(event, 400, 'Missing required field: task');

    const connResult = await ddb.send(
      new GetCommand({ TableName: TABLE, Key: { PK: `CONNECTION#${userId}`, SK: 'META' } }),
    );

    const connectionId = connResult.Item?.connectionId;
    if (!connectionId) {
      return errorResponse(
        event, 503,
        'Open Interpreter relay not connected. Open the Autnio web app and ensure the relay shows connected.',
      );
    }

    const endpoint = process.env.WEBSOCKET_API_ENDPOINT;
    if (!endpoint) return errorResponse(event, 500, 'WEBSOCKET_API_ENDPOINT not configured');

    const apigw = new ApiGatewayManagementApiClient({ endpoint });
    const payload = JSON.stringify({ type: 'task', task, sessionId: sessionId ?? '', userId });

    await apigw.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(payload),
    }));

    return bedrockResponse(event, 200, 'Task dispatched to Open Interpreter', {
      userId,
      sessionId: sessionId ?? '',
    });
  } catch (err) {
    if (err.name === 'GoneException') {
      return errorResponse(event, 503, 'Relay connection is stale. Reconnect in the Autnio web app.');
    }
    return errorResponse(event, 500, err.message);
  }
};
