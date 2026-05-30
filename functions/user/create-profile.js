// Dev 2 — implement this handler
// Triggered by Cognito post-confirmation (not API Gateway)
// event.userName = Cognito sub, event.request.userAttributes = user attrs
// Must write USER#<sub> | PROFILE to DynamoDB

exports.handler = async (event) => {
  // Must return the event object for Cognito triggers
  return event;
};
