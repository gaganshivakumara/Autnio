import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';

interface FunctionsStackProps extends cdk.StackProps {
  appEnv: string;
  table: dynamodb.Table;
  userPool: cognito.UserPool;
}

export interface ExportedFunctions {
  // Dev 2 — automation
  sendEmail: lambda.Function;
  triggerApify: lambda.Function;
  checkApifyRun: lambda.Function;
  // Dev 2 — files
  boxRead: lambda.Function;
  boxWrite: lambda.Function;
  // Dev 2 — data / user
  getProfile: lambda.Function;
  updateProfile: lambda.Function;
  // Dev 4 — vision
  analyzeImage: lambda.Function;
  extractText: lambda.Function;
  synthesizeSpeech: lambda.Function;
}

export class FunctionsStack extends cdk.Stack {
  readonly exportedFunctions: ExportedFunctions;

  constructor(scope: Construct, id: string, props: FunctionsStackProps) {
    super(scope, id, props);

    const { appEnv, table, userPool } = props;

    const secretsPrefix = `/autnio/${appEnv}/`;

    const commonEnv: Record<string, string> = {
      APP_ENV: appEnv,
      DYNAMODB_TABLE: table.tableName,
      COGNITO_USER_POOL_ID: userPool.userPoolId,
      SECRETS_PREFIX: secretsPrefix,
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
    };

    const defaultLambdaRole = new iam.Role(this, 'LambdaBaseRole', {
      roleName: `autnio-${appEnv}-lambda-base`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    // Allow reading secrets under the env prefix
    defaultLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:/autnio/${appEnv}/*`,
        ],
      }),
    );

    const mkFn = (
      id: string,
      handler: string,
      assetDir: string,
      extraEnv?: Record<string, string>,
      extraPolicies?: iam.PolicyStatement[],
    ): lambda.Function => {
      const fn = new lambda.Function(this, id, {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler,
        code: lambda.Code.fromAsset(path.join(__dirname, '../../functions', assetDir)),
        environment: { ...commonEnv, ...extraEnv },
        role: defaultLambdaRole,
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        functionName: `autnio-${appEnv}-${id.toLowerCase().replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`,
        logRetention: logs.RetentionDays.TWO_WEEKS,
      });
      extraPolicies?.forEach(p => fn.addToRolePolicy(p));
      table.grantReadWriteData(fn);
      return fn;
    };

    // ── Automation ───────────────────────────────────────────────────────────
    const sendEmail = mkFn('SendEmail', 'send-email.handler', 'automation', {
      SES_FROM_ADDRESS: 'noreply@autnio.app',
    }, [
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      }),
    ]);

    const triggerApify = mkFn('TriggerApify', 'trigger-apify.handler', 'automation');
    const checkApifyRun = mkFn('CheckApifyRun', 'check-apify-run.handler', 'automation');

    // ── Files (Box) ──────────────────────────────────────────────────────────
    const boxRead = mkFn('BoxRead', 'box-read.handler', 'files');
    const boxWrite = mkFn('BoxWrite', 'box-write.handler', 'files');

    // ── User / Profile ───────────────────────────────────────────────────────
    const getProfile = mkFn('GetProfile', 'get-profile.handler', 'user');
    const updateProfile = mkFn('UpdateProfile', 'update-profile.handler', 'user');

    // ── Vision (Dev 4) ───────────────────────────────────────────────────────
    const visionPolicy = new iam.PolicyStatement({
      actions: [
        'rekognition:DetectLabels',
        'rekognition:DetectText',
        'rekognition:RecognizeCelebrities',
        'textract:DetectDocumentText',
        'textract:AnalyzeDocument',
      ],
      resources: ['*'],
    });

    const pollyPolicy = new iam.PolicyStatement({
      actions: ['polly:SynthesizeSpeech'],
      resources: ['*'],
    });

    const analyzeImage = mkFn('AnalyzeImage', 'analyze-image.handler', 'vision', {}, [visionPolicy]);
    const extractText = mkFn('ExtractText', 'extract-text.handler', 'vision', {}, [visionPolicy]);
    const synthesizeSpeech = mkFn('SynthesizeSpeech', 'synthesize-speech.handler', 'vision', {}, [pollyPolicy]);

    this.exportedFunctions = {
      sendEmail,
      triggerApify,
      checkApifyRun,
      boxRead,
      boxWrite,
      getProfile,
      updateProfile,
      analyzeImage,
      extractText,
      synthesizeSpeech,
    };

    // Outputs for Dev 1 (needs ARNs to register Bedrock action groups)
    const fnOutputs: [string, lambda.Function][] = [
      ['SendEmailArn', sendEmail],
      ['TriggerApifyArn', triggerApify],
      ['CheckApifyRunArn', checkApifyRun],
      ['BoxReadArn', boxRead],
      ['BoxWriteArn', boxWrite],
      ['GetProfileArn', getProfile],
      ['UpdateProfileArn', updateProfile],
      ['AnalyzeImageArn', analyzeImage],
      ['ExtractTextArn', extractText],
      ['SynthesizeSpeechArn', synthesizeSpeech],
    ];

    fnOutputs.forEach(([outputId, fn]) => {
      new cdk.CfnOutput(this, outputId, {
        value: fn.functionArn,
        exportName: `autnio-${appEnv}-${outputId.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`,
        description: 'Lambda ARN — share with Dev 1 for Bedrock action groups',
      });
    });

    new cdk.CfnOutput(this, 'LambdaBaseRoleArn', {
      value: defaultLambdaRole.roleArn,
      exportName: `autnio-${appEnv}-lambda-base-role-arn`,
      description: 'Base Lambda execution role ARN — share with Dev 2',
    });
  }
}
