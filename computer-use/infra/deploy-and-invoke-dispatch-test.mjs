import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import iamPkg from "@aws-sdk/client-iam";
import lambdaPkg from "@aws-sdk/client-lambda";
import ddbPkg from "@aws-sdk/client-dynamodb";

const { IAMClient, GetRoleCommand } = iamPkg;
const {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  InvokeCommand,
  GetFunctionCommand,
} = lambdaPkg;
const { DynamoDBClient, GetItemCommand } = ddbPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const outputsPath = path.join(__dirname, "deployment-outputs.json");

if (!fs.existsSync(outputsPath)) {
  console.error(`Missing deployment outputs: ${outputsPath}`);
  process.exit(1);
}

const outputs = JSON.parse(fs.readFileSync(outputsPath, "utf8"));
const region = outputs.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const functionName =
  process.env.DISPATCH_TEST_FUNCTION_NAME || "autnio-computer-use-dev-dispatch-test";

const iam = new IAMClient({ region });
const lambda = new LambdaClient({ region });
const ddb = new DynamoDBClient({ region });

const zipPath = path.join(__dirname, "dispatch-test.zip");

function zipDispatch() {
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const agentDir = path.join(repoRoot, "functions", "agent");
  execSync(
    `cd "${agentDir}" && zip -j "${zipPath}" dispatch.py bedrock_util.py`,
    { stdio: "inherit" },
  );
  return fs.readFileSync(zipPath);
}

async function ensureFunction(codeZip) {
  const roleName = outputs.LAMBDA_ROLE_NAME;
  if (!roleName) throw new Error("LAMBDA_ROLE_NAME missing from deployment outputs");
  const roleResp = await iam.send(new GetRoleCommand({ RoleName: roleName }));
  const roleArn = roleResp.Role?.Arn;
  if (!roleArn) throw new Error(`Unable to resolve role ARN for ${roleName}`);

  const env = {
    WEBSOCKET_API_ENDPOINT: outputs.WEBSOCKET_API_ENDPOINT,
    CONNECTIONS_TABLE_NAME: outputs.CONNECTIONS_TABLE_NAME,
  };

  try {
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: "python3.12",
        Handler: "dispatch.handler",
        Role: roleArn,
        Code: { ZipFile: codeZip },
        Timeout: 10,
        Environment: { Variables: env },
      }),
    );
  } catch (err) {
    if (err?.name !== "ResourceConflictException") throw err;
    await updateFunctionCodeWithRetry(codeZip);
    await updateFunctionConfigWithRetry(env);
  }
}

async function updateFunctionCodeWithRetry(codeZip) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await lambda.send(
        new UpdateFunctionCodeCommand({
          FunctionName: functionName,
          ZipFile: codeZip,
        }),
      );
      return;
    } catch (err) {
      const busy = err?.name === "ResourceConflictException";
      if (!busy || attempt === 8) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function updateFunctionConfigWithRetry(env) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await lambda.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          Timeout: 10,
          Environment: { Variables: env },
        }),
      );
      return;
    } catch (err) {
      const busy = err?.name === "ResourceConflictException";
      if (!busy || attempt === 8) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function waitForLambdaActive(maxAttempts = 20) {
  for (let i = 1; i <= maxAttempts; i++) {
    const fn = await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
    const state = fn.Configuration?.State;
    if (state === "Active") return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Lambda ${functionName} did not become Active in time`);
}

async function showRelayConnectionStatus() {
  if (!outputs.CONNECTIONS_TABLE_NAME) return;
  const row = await ddb.send(
    new GetItemCommand({
      TableName: outputs.CONNECTIONS_TABLE_NAME,
      Key: { userId: { S: "demo-user" } },
    }),
  );
  if (row.Item?.connectionId?.S) {
    console.log(`demo-user connection found: ${row.Item.connectionId.S}`);
  } else {
    console.log("demo-user has no active relay connection in DynamoDB.");
  }
}

async function invokeTest() {
  const event = {
    actionGroup: "computer-automation",
    apiPath: "/dispatch",
    httpMethod: "POST",
    requestBody: {
      content: {
        "application/json": {
          properties: [
            { name: "task", value: "Open a browser and print hello world." },
            { name: "userId", value: "demo-user" },
            { name: "sessionId", value: "demo-session" },
          ],
        },
      },
    },
  };

  let invokeResp = null;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      invokeResp = await lambda.send(
        new InvokeCommand({
          FunctionName: functionName,
          InvocationType: "RequestResponse",
          Payload: Buffer.from(JSON.stringify(event)),
        }),
      );
      break;
    } catch (err) {
      const busy = err?.name === "ResourceConflictException";
      if (!busy || attempt === 8) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  if (!invokeResp) throw new Error("Lambda invoke failed unexpectedly");
  const payload = Buffer.from(invokeResp.Payload || []).toString("utf8");
  console.log("Dispatch invoke result:");
  console.log(payload);
}

async function main() {
  const zip = zipDispatch();
  await ensureFunction(zip);
  await waitForLambdaActive();
  await showRelayConnectionStatus();
  await invokeTest();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
