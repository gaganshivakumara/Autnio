import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ddbPkg from "@aws-sdk/client-dynamodb";
import apigwPkg from "@aws-sdk/client-apigatewayv2";
import iamPkg from "@aws-sdk/client-iam";
import lambdaPkg from "@aws-sdk/client-lambda";

const { DynamoDBClient, DeleteTableCommand } = ddbPkg;
const { ApiGatewayV2Client, DeleteApiCommand } = apigwPkg;
const { IAMClient, DeleteRolePolicyCommand, DeleteRoleCommand } = iamPkg;
const { LambdaClient, DeleteFunctionCommand } = lambdaPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputsPath = path.join(__dirname, "deployment-outputs.json");

if (!fs.existsSync(outputsPath)) {
  console.error("deployment-outputs.json not found. Nothing to destroy.");
  process.exit(1);
}

const outputs = JSON.parse(fs.readFileSync(outputsPath, "utf8"));
const region = outputs.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

const ddb = new DynamoDBClient({ region });
const apigw = new ApiGatewayV2Client({ region });
const iam = new IAMClient({ region });
const lambda = new LambdaClient({ region });

async function safe(run) {
  try {
    await run();
  } catch (err) {
    const name = err?.name || "Error";
    if (
      name.includes("NotFound") ||
      name.includes("ResourceNotFound") ||
      name.includes("NoSuchEntity")
    ) {
      return;
    }
    throw err;
  }
}

async function main() {
  for (const fn of [
    outputs.WS_CONNECT_FUNCTION,
    outputs.WS_DISCONNECT_FUNCTION,
    outputs.WS_RESULT_FUNCTION,
  ]) {
    if (!fn) continue;
    await safe(() => lambda.send(new DeleteFunctionCommand({ FunctionName: fn })));
  }

  if (outputs.WS_API_ID) {
    await safe(() => apigw.send(new DeleteApiCommand({ ApiId: outputs.WS_API_ID })));
  }

  if (outputs.CONNECTIONS_TABLE_NAME) {
    await safe(() =>
      ddb.send(new DeleteTableCommand({ TableName: outputs.CONNECTIONS_TABLE_NAME })),
    );
  }
  if (outputs.TASKS_TABLE_NAME) {
    await safe(() => ddb.send(new DeleteTableCommand({ TableName: outputs.TASKS_TABLE_NAME })));
  }

  if (outputs.LAMBDA_ROLE_NAME) {
    await safe(() =>
      iam.send(
        new DeleteRolePolicyCommand({
          RoleName: outputs.LAMBDA_ROLE_NAME,
          PolicyName: `${outputs.LAMBDA_ROLE_NAME}-inline`,
        }),
      ),
    );
    await safe(() => iam.send(new DeleteRoleCommand({ RoleName: outputs.LAMBDA_ROLE_NAME })));
  }

  console.log("Destroy complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
