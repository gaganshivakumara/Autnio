import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ddbPkg from "@aws-sdk/client-dynamodb";
import apigwPkg from "@aws-sdk/client-apigatewayv2";
import iamPkg from "@aws-sdk/client-iam";
import lambdaPkg from "@aws-sdk/client-lambda";
import stsPkg from "@aws-sdk/client-sts";

const {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  waitUntilTableExists,
  UpdateTimeToLiveCommand,
} = ddbPkg;
const {
  ApiGatewayV2Client,
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
  GetApisCommand,
  GetRoutesCommand,
  GetIntegrationsCommand,
  DeleteRouteCommand,
  DeleteIntegrationCommand,
} = apigwPkg;
const { IAMClient, CreateRoleCommand, PutRolePolicyCommand, GetRoleCommand } = iamPkg;
const {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  AddPermissionCommand,
  RemovePermissionCommand,
  GetPolicyCommand,
  GetFunctionCommand,
} = lambdaPkg;
const { STSClient, GetCallerIdentityCommand } = stsPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const lambdaSourceDir = path.join(root, "lambdas");
const region = process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || "us-east-1";
const deploymentName = process.env.COMPUTER_USE_DEPLOYMENT_NAME || "autnio-computer-use-dev";
const namePrefix = deploymentName;
const statePath = path.join(__dirname, "deployment-state.json");
const outputsPath = path.join(__dirname, "deployment-outputs.json");

const ddb = new DynamoDBClient({ region });
const apigw = new ApiGatewayV2Client({ region });
const iam = new IAMClient({ region });
const lambda = new LambdaClient({ region });
const sts = new STSClient({ region });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readState() {
  if (!fs.existsSync(statePath)) return {};
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function zipLambdas() {
  const { execSync } = await import("child_process");
  const zipPath = path.join(__dirname, "lambdas.zip");
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(
    `cd "${lambdaSourceDir}" && zip -r "${zipPath}" . -x "__pycache__/*" "*.pyc"`,
    { stdio: "inherit" },
  );
  return fs.readFileSync(zipPath);
}

async function createTable(tableName, keyName, ttl = false) {
  try {
    await ddb.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [{ AttributeName: keyName, AttributeType: "S" }],
        KeySchema: [{ AttributeName: keyName, KeyType: "HASH" }],
      }),
    );
    await waitUntilTableExists({ client: ddb, maxWaitTime: 120 }, { TableName: tableName });
    if (ttl) {
      // Keep optional; ttl can be configured manually if needed.
    }
  } catch (err) {
    if (err?.name !== "ResourceInUseException") throw err;
  }
  await ddb.send(new DescribeTableCommand({ TableName: tableName }));
  if (ttl) {
    try {
      await ddb.send(
        new UpdateTimeToLiveCommand({
          TableName: tableName,
          TimeToLiveSpecification: {
            AttributeName: "ttl",
            Enabled: true,
          },
        }),
      );
    } catch (err) {
      if (err?.name !== "ValidationException") throw err;
    }
  }
}

async function ensureRole(roleName, accountId, connectionsTable, tasksTable) {
  const assumeRolePolicyDocument = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  });

  try {
    await iam.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
      }),
    );
  } catch (err) {
    const name = err?.name || "";
    const code = err?.Code || err?.code || "";
    if (!name.includes("EntityAlreadyExists") && String(code) !== "EntityAlreadyExists") {
      throw err;
    }
  }

  const policyDocument = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Scan"],
        Resource: [
          `arn:aws:dynamodb:${region}:${accountId}:table/${connectionsTable}`,
          `arn:aws:dynamodb:${region}:${accountId}:table/${tasksTable}`,
        ],
      },
      {
        Effect: "Allow",
        Action: ["execute-api:ManageConnections"],
        Resource: "*",
      },
    ],
  });

  await iam.send(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: `${roleName}-inline`,
      PolicyDocument: policyDocument,
    }),
  );

  const role = await iam.send(new GetRoleCommand({ RoleName: roleName }));
  return role.Role.Arn;
}

async function ensureFunction(functionName, handler, roleArn, zipBytes, env) {
  let createdOrUpdated = false;
  let lastError = null;

  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      try {
        await lambda.send(
          new CreateFunctionCommand({
            FunctionName: functionName,
            Runtime: "python3.12",
            Handler: handler,
            Role: roleArn,
            Code: { ZipFile: zipBytes },
            Environment: { Variables: env },
            Timeout: 10,
          }),
        );
      } catch (err) {
        if (err?.name !== "ResourceConflictException") throw err;
        await updateFunctionCodeWithRetry(functionName, zipBytes);
        await updateFunctionConfigWithRetry(functionName, roleArn, env);
      }
      createdOrUpdated = true;
      break;
    } catch (err) {
      lastError = err;
      const message = err?.message || "";
      const isRoleDelay =
        err?.name === "InvalidParameterValueException" &&
        message.includes("cannot be assumed by Lambda");
      if (!isRoleDelay || attempt === 8) break;
      await sleep(5000);
    }
  }

  if (!createdOrUpdated && lastError) {
    throw lastError;
  }

  const fn = await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
  return fn.Configuration.FunctionArn;
}

async function updateFunctionCodeWithRetry(functionName, zipBytes) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await lambda.send(
        new UpdateFunctionCodeCommand({
          FunctionName: functionName,
          ZipFile: zipBytes,
        }),
      );
      return;
    } catch (err) {
      const isBusyConflict = err?.name === "ResourceConflictException";
      if (!isBusyConflict || attempt === 8) throw err;
      await sleep(2500);
    }
  }
}

async function updateFunctionConfigWithRetry(functionName, roleArn, env) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await lambda.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          Role: roleArn,
          Environment: { Variables: env },
          Timeout: 10,
        }),
      );
      return;
    } catch (err) {
      const isBusyConflict = err?.name === "ResourceConflictException";
      if (!isBusyConflict || attempt === 8) throw err;
      await sleep(2500);
    }
  }
}

async function lookupExistingApiIdByName(apiName) {
  let nextToken = undefined;
  while (true) {
    const page = await apigw.send(new GetApisCommand({ NextToken: nextToken, MaxResults: "500" }));
    const found = (page.Items || []).find((api) => api.Name === apiName);
    if (found?.ApiId) return found.ApiId;
    if (!page.NextToken) break;
    nextToken = page.NextToken;
  }
  return null;
}

async function removeLambdaPermissionIfExists(functionName, statementId) {
  try {
    const policy = await lambda.send(new GetPolicyCommand({ FunctionName: functionName }));
    const doc = JSON.parse(policy.Policy || "{}");
    const exists = Array.isArray(doc.Statement)
      ? doc.Statement.some((stmt) => stmt.Sid === statementId)
      : false;
    if (!exists) return;
    await lambda.send(
      new RemovePermissionCommand({
        FunctionName: functionName,
        StatementId: statementId,
      }),
    );
  } catch (err) {
    const name = err?.name || "";
    if (name.includes("ResourceNotFound")) return;
    if (name.includes("PolicyNotFound")) return;
    throw err;
  }
}

async function ensureApi(apiName, previousApiId) {
  if (previousApiId) {
    try {
      // Verify previous API still exists
      await apigw.send(new GetRoutesCommand({ ApiId: previousApiId }));
      return { ApiId: previousApiId };
    } catch (_err) {
      // ignore and recreate
    }
  }

  const existingByName = await lookupExistingApiIdByName(apiName);
  if (existingByName) {
    return { ApiId: existingByName };
  }

  return apigw.send(
    new CreateApiCommand({
      Name: apiName,
      ProtocolType: "WEBSOCKET",
      RouteSelectionExpression: "$request.body.type",
    }),
  );
}

async function resetRoutesAndIntegrations(apiId) {
  const routes = await apigw.send(new GetRoutesCommand({ ApiId: apiId }));
  for (const route of routes.Items || []) {
    if (route.RouteId) {
      await apigw.send(
        new DeleteRouteCommand({
          ApiId: apiId,
          RouteId: route.RouteId,
        }),
      );
    }
  }

  const integrations = await apigw.send(new GetIntegrationsCommand({ ApiId: apiId }));
  for (const integration of integrations.Items || []) {
    if (integration.IntegrationId) {
      await apigw.send(
        new DeleteIntegrationCommand({
          ApiId: apiId,
          IntegrationId: integration.IntegrationId,
        }),
      );
    }
  }
}

async function main() {
  const state = readState();
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account;
  if (!accountId) throw new Error("Unable to resolve AWS account ID");

  const connectionsTable = `${namePrefix}-connections`;
  const tasksTable = `${namePrefix}-tasks`;
  const roleName = `${namePrefix}-lambda-role`;
  const wsConnectName = `${namePrefix}-ws-connect`;
  const wsDisconnectName = `${namePrefix}-ws-disconnect`;
  const wsResultName = `${namePrefix}-ws-result`;

  await createTable(connectionsTable, "userId", true);
  await createTable(tasksTable, "taskId", false);

  const roleArn = await ensureRole(roleName, accountId, connectionsTable, tasksTable);
  const zipBytes = await zipLambdas();
  const env = {
    CONNECTIONS_TABLE_NAME: connectionsTable,
    TASKS_TABLE_NAME: tasksTable,
    ALLOW_DEV_BYPASS: "true",
  };

  const connectArn = await ensureFunction(wsConnectName, "ws_connect.handler", roleArn, zipBytes, env);
  const disconnectArn = await ensureFunction(wsDisconnectName, "ws_disconnect.handler", roleArn, zipBytes, env);
  const resultArn = await ensureFunction(wsResultName, "ws_result.handler", roleArn, zipBytes, env);

  const apiName = `${namePrefix}-ws-api`;
  const api = await ensureApi(apiName, state.WS_API_ID);
  await resetRoutesAndIntegrations(api.ApiId);

  const connectIntegration = await apigw.send(
    new CreateIntegrationCommand({
      ApiId: api.ApiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: connectArn,
      IntegrationMethod: "POST",
    }),
  );
  const disconnectIntegration = await apigw.send(
    new CreateIntegrationCommand({
      ApiId: api.ApiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: disconnectArn,
      IntegrationMethod: "POST",
    }),
  );
  const defaultIntegration = await apigw.send(
    new CreateIntegrationCommand({
      ApiId: api.ApiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: resultArn,
      IntegrationMethod: "POST",
    }),
  );

  await apigw.send(
    new CreateRouteCommand({
      ApiId: api.ApiId,
      RouteKey: "$connect",
      Target: `integrations/${connectIntegration.IntegrationId}`,
    }),
  );
  await apigw.send(
    new CreateRouteCommand({
      ApiId: api.ApiId,
      RouteKey: "$disconnect",
      Target: `integrations/${disconnectIntegration.IntegrationId}`,
    }),
  );
  await apigw.send(
    new CreateRouteCommand({
      ApiId: api.ApiId,
      RouteKey: "$default",
      Target: `integrations/${defaultIntegration.IntegrationId}`,
    }),
  );

  try {
    await apigw.send(
      new CreateStageCommand({
        ApiId: api.ApiId,
        StageName: "dev",
        AutoDeploy: true,
      }),
    );
  } catch (err) {
    if (err?.name !== "ConflictException") throw err;
  }

  for (const [functionName, route] of [
    [wsConnectName, "$connect"],
    [wsDisconnectName, "$disconnect"],
    [wsResultName, "$default"],
  ]) {
    const statementId = `${namePrefix}-${route.replace("$", "route-")}`;
    await removeLambdaPermissionIfExists(functionName, statementId);
    try {
      await lambda.send(
        new AddPermissionCommand({
          FunctionName: functionName,
          StatementId: statementId,
          Action: "lambda:InvokeFunction",
          Principal: "apigateway.amazonaws.com",
          SourceArn: `arn:aws:execute-api:${region}:${accountId}:${api.ApiId}/*/${route}`,
        }),
      );
    } catch (err) {
      if (err?.name !== "ResourceConflictException") throw err;
    }
  }

  const wsEndpoint = `wss://${api.ApiId}.execute-api.${region}.amazonaws.com/dev`;
  const outputs = {
    WEBSOCKET_API_ENDPOINT: wsEndpoint,
    VITE_WS_API_URL: wsEndpoint,
    CONNECTIONS_TABLE_NAME: connectionsTable,
    TASKS_TABLE_NAME: tasksTable,
    WS_API_ID: api.ApiId,
    WS_CONNECT_FUNCTION: wsConnectName,
    WS_DISCONNECT_FUNCTION: wsDisconnectName,
    WS_RESULT_FUNCTION: wsResultName,
    LAMBDA_ROLE_NAME: roleName,
    AWS_REGION: region,
  };

  writeState(outputs);
  fs.writeFileSync(outputsPath, JSON.stringify(outputs, null, 2));
  console.log(JSON.stringify(outputs, null, 2));
  console.log(`\nSaved outputs to ${outputsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
