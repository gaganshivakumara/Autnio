# Dev 3 — Auth, Infrastructure & DevOps

**Owner:** Dev 3
**Tech:** AWS CDK (TypeScript), Amazon Cognito, API Gateway (REST + WebSocket), S3, CloudFront, Secrets Manager, GitHub Actions

---

## Overview

Dev 3 owns everything that the other three developers depend on. **Build this first — no one else can deploy or test against real AWS until you deliver.**

Your outputs are: a Cognito user pool, a DynamoDB table, a REST API endpoint, a WebSocket API endpoint, deployed Lambda functions, a hosted web app, and all secrets loaded into Secrets Manager. You deliver these as environment variables and ARNs; everyone else consumes them.

---

## Responsibilities

1. Provision all AWS infrastructure via CDK
2. Configure Cognito authentication
3. Create REST API Gateway (→ Bedrock Agent) and WebSocket API Gateway (→ Open Interpreter relay)
4. Deploy Lambda functions from Dev 2 and Dev 4
5. Host the web app on S3 + CloudFront
6. Load all secrets into Secrets Manager
7. Create IAM roles for each Lambda function group
8. Set up GitHub Actions CI/CD pipeline
9. Propagate environment variables to everyone

---

## CDK Stacks

All stacks live in `infra/`. Deploy with:

```bash
cd infra
npm install
cdk bootstrap   # first time only
cdk deploy --all
```

### Stack 1 — `SecretsStack`

Deploy first. Loads all third-party credentials into Secrets Manager so other stacks can reference them.

```typescript
// infra/lib/secrets-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class SecretsStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new secretsmanager.Secret(this, 'ApifyToken', {
      secretName: '/autnio/apify/api-token',
    });
    new secretsmanager.Secret(this, 'BoxClientId', {
      secretName: '/autnio/box/client-id',
    });
    new secretsmanager.Secret(this, 'BoxClientSecret', {
      secretName: '/autnio/box/client-secret',
    });
    new secretsmanager.Secret(this, 'BoxConfigJson', {
      secretName: '/autnio/box/config-json',
    });
    new secretsmanager.Secret(this, 'QwenModelId', {
      secretName: '/autnio/bedrock/qwen-model-id',
      secretStringValue: cdk.SecretValue.unsafePlainText('qwen.qwen3-vl-235b-a22b'),
    });
    new secretsmanager.Secret(this, 'NemotronModelId', {
      secretName: '/autnio/bedrock/nemotron-model-id',
      secretStringValue: cdk.SecretValue.unsafePlainText('nvidia.nemotron-nano-12b-v2'),
    });
    new secretsmanager.Secret(this, 'OiBedrockModelId', {
      secretName: '/autnio/bedrock/oi-model-id',
      secretStringValue: cdk.SecretValue.unsafePlainText('anthropic.claude-3-5-sonnet-20241022-v2:0'),
    });
  }
}
```

Populate the secret values (Apify token, Box credentials) manually in the AWS console or via `aws secretsmanager put-secret-value` after stack deployment.

### Stack 2 — `CognitoStack`

```typescript
// infra/lib/cognito-stack.ts
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class CognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'AutnioUserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: { minLength: 8, requireDigits: true },
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'AutnioWebClient', {
      userPool: this.userPool,
      generateSecret: false,            // public client (web app)
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        callbackUrls: ['https://<cloudfront-domain>/callback'],
        logoutUrls: ['https://<cloudfront-domain>/logout'],
      },
    });
  }
}
```

**Deliver to Dev 4:** `userPool.userPoolId` and `userPoolClient.userPoolClientId` as env vars for the web app.

### Stack 3 — `DynamoStack`

```typescript
// infra/lib/dynamo-stack.ts
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class DynamoStack extends cdk.Stack {
  public readonly usersTable: dynamodb.Table;
  public readonly tasksTable: dynamodb.Table;
  public readonly connectionsTable: dynamodb.Table;

  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    this.tasksTable = new dynamodb.Table(this, 'TasksTable', {
      partitionKey: { name: 'taskId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Stores active WebSocket connection IDs for the OI relay
    this.connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
    });
  }
}
```

**Deliver to Dev 2:** all three table names.

### Stack 4 — `ApiStack`

Creates both the REST API (Bedrock Agent proxy) and the WebSocket API (Open Interpreter relay).

```typescript
// infra/lib/api-stack.ts
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';

export class ApiStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // REST API — proxies authenticated requests to Bedrock Agent
    const restApi = new apigw.RestApi(this, 'AutnioRestApi', {
      defaultCorsPreflightOptions: { allowOrigins: apigw.Cors.ALL_ORIGINS },
    });
    const cognitoAuthorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [cognitoStack.userPool],
    });
    restApi.root.addResource('chat').addMethod('POST', bedrockIntegration, {
      authorizer: cognitoAuthorizer,
    });

    // WebSocket API — Open Interpreter relay
    const wsApi = new apigwv2.WebSocketApi(this, 'OiRelayWsApi', {
      connectRouteOptions: { integration: wsConnectIntegration },
      disconnectRouteOptions: { integration: wsDisconnectIntegration },
      defaultRouteOptions: { integration: wsDefaultIntegration },
    });
    new apigwv2.WebSocketStage(this, 'WsDevStage', {
      webSocketApi: wsApi,
      stageName: 'dev',
      autoDeploy: true,
    });
  }
}
```

**Deliver to Dev 2:** WebSocket API endpoint URL (`wss://...execute-api.region.amazonaws.com/dev`)
**Deliver to Dev 4:** REST API URL and WebSocket API URL

### Stack 5 — `LambdaStack`

Deploys all Lambda functions from Dev 2 and Dev 4 with the correct IAM roles and environment variables.

IAM roles (least privilege):

| Role | Permissions |
|---|---|
| `AutomationLambdaRole` | DynamoDB read/write (`connections`, `tasks`), `execute-api:ManageConnections` (WebSocket push) |
| `DataLambdaRole` | DynamoDB read (`users`), outbound HTTPS |
| `FilesLambdaRole` | Secrets Manager read (Box credentials), DynamoDB read |
| `UserLambdaRole` | DynamoDB read/write (`users`, `tasks`) |
| `VisionLambdaRole` | `bedrock:InvokeModel` for Qwen + Nemotron model IDs, S3 read, DynamoDB write |
| `WsConnectLambdaRole` | DynamoDB write (`connections`) |

### Stack 6 — `HostingStack`

```typescript
// infra/lib/hosting-stack.ts
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

export class HostingStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'WebAppBucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',   // SPA fallback
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'WebAppCDN', {
      originConfigs: [{
        s3OriginSource: { s3BucketSource: bucket },
        behaviors: [{ isDefaultBehavior: true }],
      }],
    });

    new s3deploy.BucketDeployment(this, 'DeployWebApp', {
      sources: [s3deploy.Source.asset('../web/dist')],
      destinationBucket: bucket,
      distribution,
    });
  }
}
```

Dev 4 runs `npm run build` in `web/` before Dev 3 deploys. CloudFront domain is the canonical web app URL.

---

## File Structure

```
infra/
├── bin/
│   └── autnio.ts              # CDK app entry — instantiates all stacks
├── lib/
│   ├── secrets-stack.ts
│   ├── cognito-stack.ts
│   ├── dynamo-stack.ts
│   ├── api-stack.ts
│   ├── lambda-stack.ts
│   └── hosting-stack.ts
├── cdk.json
└── package.json
.github/
└── workflows/
    ├── deploy-dev.yml         # push to develop → deploy to dev
    └── deploy-prod.yml        # PR merge to main → deploy to prod
```

---

## CI/CD Pipeline

### `deploy-dev.yml`
```yaml
on:
  push:
    branches: [develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '18' }
      - run: npm ci
        working-directory: infra
      - run: npm run build
        working-directory: web
      - run: npx cdk deploy --all --require-approval never
        working-directory: infra
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: us-east-1
```

`deploy-prod.yml` is identical but triggers on push to `main` and requires manual approval in GitHub Actions.

---

## Needs From Others

| From | What |
|---|---|
| Dev 2 | Lambda function code (for `LambdaStack` deployment) |
| Dev 4 | Web app build output (`web/dist/`) (for `HostingStack` deployment) |

## Provides To Others

| To | What | How |
|---|---|---|
| Dev 1 | Cognito Pool IDs, IAM role for Bedrock Agent | Env vars / CDK outputs |
| Dev 2 | IAM roles, Secrets Manager paths, DynamoDB table names, WebSocket API URL | CDK outputs |
| Dev 4 | Cognito User Pool ID + Client ID, REST API URL, WebSocket API URL, CloudFront URL | CDK outputs |

---

## Definition of Done

- [ ] `cdk deploy --all` succeeds from a clean AWS account
- [ ] Cognito sign-up and sign-in work end-to-end (new user can get a JWT)
- [ ] REST API `POST /chat` rejects unauthenticated requests (401) and accepts valid JWTs
- [ ] WebSocket API: client can connect, receives a connection ID stored in `connections` DynamoDB table
- [ ] All Secrets Manager entries are populated with real values
- [ ] CI/CD pipeline deploys successfully on `develop` push
- [ ] CloudFront serves the web app (returns 200 on root and on SPA deep links)
