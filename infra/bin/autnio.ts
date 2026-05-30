#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { DataStack } from '../lib/data-stack';
import { FunctionsStack } from '../lib/functions-stack';
import { AgentStack } from '../lib/agent-stack';
import { ApiStack } from '../lib/api-stack';
import { WsStack } from '../lib/ws-stack';
import { HostingStack } from '../lib/hosting-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

const env = app.node.tryGetContext('env') ?? 'dev';

const awsEnv: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const prefix = `Autnio-${env.charAt(0).toUpperCase() + env.slice(1)}`;

const authStack = new AuthStack(app, `${prefix}-Auth`, {
  env: awsEnv,
  appEnv: env,
});

const dataStack = new DataStack(app, `${prefix}-Data`, {
  env: awsEnv,
  appEnv: env,
});

const functionsStack = new FunctionsStack(app, `${prefix}-Functions`, {
  env: awsEnv,
  appEnv: env,
  table: dataStack.table,
  userPool: authStack.userPool,
});
functionsStack.addDependency(authStack);
functionsStack.addDependency(dataStack);

// WebSocket API — depends on WS Lambda stubs from FunctionsStack
// CDK resolves the deploy order automatically via the Lambda cross-references.
// WEBSOCKET_API_ENDPOINT is NOT injected here to avoid a circular stack reference.
// After first deploy, set it on dispatchOI and wsDefault Lambdas using the
// WsCallbackUrl output from this stack (one-time manual step or CI/CD post-hook).
const wsStack = new WsStack(app, `${prefix}-Ws`, {
  env: awsEnv,
  appEnv: env,
  functions: functionsStack.exportedFunctions,
});

const agentStack = new AgentStack(app, `${prefix}-Agent`, {
  env: awsEnv,
  appEnv: env,
  functions: functionsStack.exportedFunctions,
});
agentStack.addDependency(functionsStack);

// Inject Bedrock Agent IDs into the chat proxy Lambda
// Primary: Qwen3-VL (on-demand detection, high accuracy)
functionsStack.exportedFunctions.chatAgent.addEnvironment('BEDROCK_AGENT_ID', 'GI3CLHR41T');
functionsStack.exportedFunctions.chatAgent.addEnvironment('BEDROCK_AGENT_ALIAS_ID', 'IBLGJCZSMP');

const apiStack = new ApiStack(app, `${prefix}-Api`, {
  env: awsEnv,
  appEnv: env,
  userPool: authStack.userPool,
  functions: functionsStack.exportedFunctions,
});
apiStack.addDependency(authStack);
apiStack.addDependency(functionsStack);

const hostingStack = new HostingStack(app, `${prefix}-Hosting`, {
  env: awsEnv,
  appEnv: env,
});

new MonitoringStack(app, `${prefix}-Monitoring`, {
  env: awsEnv,
  appEnv: env,
  functions: functionsStack.exportedFunctions,
  api: apiStack.api,
  table: dataStack.table,
});

app.synth();
