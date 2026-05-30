/**
 * Bedrock Agent Lambda response helpers.
 * https://docs.aws.amazon.com/bedrock/latest/userguide/agents-lambda.html
 */

export function bedrockResponse(event, statusCode, result, data = {}) {
  return {
    messageVersion: '1.0',
    response: {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      httpStatusCode: statusCode,
      responseBody: {
        'application/json': {
          body: JSON.stringify({ result, data }),
        },
      },
    },
    sessionAttributes: event.sessionAttributes ?? {},
    promptSessionAttributes: event.promptSessionAttributes ?? {},
  };
}

export function errorResponse(event, statusCode, message) {
  return {
    messageVersion: '1.0',
    response: {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      httpStatusCode: statusCode,
      responseBody: {
        'application/json': {
          body: JSON.stringify({ message }),
        },
      },
    },
    sessionAttributes: event.sessionAttributes ?? {},
    promptSessionAttributes: event.promptSessionAttributes ?? {},
  };
}

// Flatten Bedrock Agent requestBody properties array into a plain object.
export function parseBody(event) {
  const props =
    event?.requestBody?.content?.['application/json']?.properties ?? [];
  return Object.fromEntries(props.map(({ name, value }) => [name, value]));
}
