// Dispatches a command to the user's registered machine via AWS SSM.
import {
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../shared/dynamodb.js';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

const ssm = new SSMClient({ region: process.env.AWS_REGION });

const ALLOWED_ACTIONS = new Set(['open', 'close', 'url']);
// Whitelist safe app name characters
const SAFE_APP_NAME = /^[a-zA-Z0-9 \-_.]+$/;

export const handler = async (event) => {
  try {
    const { application, action = 'open', parameters } = parseBody(event);
    const userId = event.sessionAttributes?.userId;

    if (!userId) return errorResponse(event, 401, 'Missing userId in session attributes');
    if (!application) return errorResponse(event, 400, 'Missing required field: application');
    if (!SAFE_APP_NAME.test(application)) {
      return errorResponse(event, 400, 'Invalid application name');
    }
    if (!ALLOWED_ACTIONS.has(action)) {
      return errorResponse(event, 400, `Invalid action. Must be one of: ${[...ALLOWED_ACTIONS].join(', ')}`);
    }

    const profileResult = await ddb.send(
      new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: 'PROFILE' } }),
    );

    const instanceId = profileResult.Item?.preferences?.ssmInstanceId;
    if (!instanceId) {
      return errorResponse(
        event,
        403,
        'No registered machine found. Install the Autnio desktop agent to enable remote app control.',
      );
    }

    const command = buildCommand(application, action, parameters);
    const sendResult = await ssm.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: { commands: [command] },
        TimeoutSeconds: 30,
      }),
    );

    const commandId = sendResult.Command.CommandId;

    // Poll up to 30 s for a result
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 5_000));
      try {
        const inv = await ssm.send(
          new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: instanceId }),
        );
        if (inv.Status === 'Success') {
          return bedrockResponse(event, 200, `${application} — ${action} succeeded`, {
            output: inv.StandardOutputContent,
          });
        }
        if (['Failed', 'Cancelled', 'TimedOut'].includes(inv.Status)) {
          return errorResponse(event, 500, `Command ${inv.Status}: ${inv.StandardErrorContent}`);
        }
      } catch (_) {
        // InvocationDoesNotExist means still in progress — keep polling
      }
    }

    return bedrockResponse(event, 202, `${application} command dispatched (still running)`, {
      commandId,
    });
  } catch (err) {
    return errorResponse(event, 500, err.message);
  }
};

function buildCommand(application, action, parameters) {
  const quoted = JSON.stringify(application); // safe shell quoting via JSON
  switch (action) {
    case 'open':
      return `open -a ${quoted}`;
    case 'close':
      return `osascript -e 'quit app ${quoted}'`;
    case 'url': {
      const url = new URL(parameters); // throws on invalid URL
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid URL protocol');
      return `open ${JSON.stringify(url.href)}`;
    }
  }
}
