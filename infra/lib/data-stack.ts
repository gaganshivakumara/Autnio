import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

interface DataStackProps extends cdk.StackProps {
  appEnv: string;
}

export class DataStack extends cdk.Stack {
  readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { appEnv } = props;

    // Single-table design: PK = entity type + ID, SK = sub-entity or metadata
    // Access patterns:
    //   USER#<sub> | PROFILE        → user profile (Dev 2: get-profile, create-profile)
    //   USER#<sub> | SESSION#<id>   → session records
    //   JOB#<id>   | META           → job data (Apify runs)
    //   FILE#<id>  | META           → Box file references
    this.table = new dynamodb.Table(this, 'MainTable', {
      tableName: `autnio-${appEnv}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecovery: appEnv === 'prod',
      removalPolicy: appEnv === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // GSI: look up all records owned by a user regardless of entity type
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Secrets for third-party integrations — Lambda functions read these at cold start
    new secretsmanager.Secret(this, 'ApifyToken', {
      secretName: `/autnio/${appEnv}/apify-token`,
      description: 'Apify API token for web automation actors',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new secretsmanager.Secret(this, 'BoxClientId', {
      secretName: `/autnio/${appEnv}/box-client-id`,
      description: 'Box OAuth2 client ID',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new secretsmanager.Secret(this, 'BoxClientSecret', {
      secretName: `/autnio/${appEnv}/box-client-secret`,
      description: 'Box OAuth2 client secret',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new secretsmanager.Secret(this, 'BoxConfigJson', {
      secretName: `/autnio/${appEnv}/box-config-json`,
      description: 'Box JWT app config JSON (server auth)',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      exportName: `autnio-${appEnv}-table-name`,
      description: 'DynamoDB table name — share with Dev 2',
    });
    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      exportName: `autnio-${appEnv}-table-arn`,
    });
    new cdk.CfnOutput(this, 'SecretsPrefix', {
      value: `/autnio/${appEnv}/`,
      exportName: `autnio-${appEnv}-secrets-prefix`,
      description: 'Secrets Manager path prefix — share with Dev 2',
    });
  }
}
