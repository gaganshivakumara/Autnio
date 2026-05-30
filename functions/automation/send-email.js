// Handles both REST (POST /automation/email) and Bedrock Agent action group events.
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

const ses = new SESClient({ region: process.env.AWS_REGION });
const FROM = process.env.SES_FROM_ADDRESS ?? 'noreply@autnio.app';

function isBedrock(event) { return Boolean(event.actionGroup); }

function restError(statusCode, message) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) };
}
function restOk(data) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

export const handler = async (event) => {
  try {
    const body = isBedrock(event)
      ? parseBody(event)
      : (typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body ?? {}));

    const { to, subject, body: emailBody, cc } = body;

    if (!to || !subject || !emailBody) {
      const msg = 'Missing required fields: to, subject, body';
      return isBedrock(event) ? errorResponse(event, 400, msg) : restError(400, msg);
    }

    const destination = { ToAddresses: to.split(',').map((e) => e.trim()) };
    if (cc) destination.CcAddresses = cc.split(',').map((e) => e.trim());

    await ses.send(new SendEmailCommand({
      Source: FROM,
      Destination: destination,
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: emailBody } },
      },
    }));

    return isBedrock(event)
      ? bedrockResponse(event, 200, `Email sent to ${to}`, { to, subject })
      : restOk({ result: `Email sent to ${to}`, data: { to, subject } });
  } catch (err) {
    return isBedrock(event)
      ? errorResponse(event, 500, err.message)
      : restError(500, err.message);
  }
};
