import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
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
  dispatchOI: lambda.Function;
  // Dev 2 — files
  boxRead: lambda.Function;
  boxWrite: lambda.Function;
  // Dev 2 — user
  getProfile: lambda.Function;
  updateProfile: lambda.Function;
  // Dev 3 — agent proxy + WebSocket relay
  chatAgent: lambda.Function;
  wsConnect: lambda.Function;
  wsDisconnect: lambda.Function;
  wsDefault: lambda.Function;
  // Dev 4 — vision
  analyzeImage: lambda.Function;
  extractText: lambda.Function;
  synthesizeSpeech: lambda.Function;
  uploadUrl: lambda.Function;
  // Dev 5 — voice
  transcribe: lambda.Function;
  tts: lambda.Function;
}

export class FunctionsStack extends cdk.Stack {
  readonly exportedFunctions: ExportedFunctions;
  readonly visionBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: FunctionsStackProps) {
    super(scope, id, props);

    const { appEnv, table, userPool } = props;

    const secretsPrefix = `/autnio/${appEnv}/`;

    // S3 bucket for vision frame uploads (phone camera → Bedrock)
    this.visionBucket = new s3.Bucket(this, 'VisionFramesBucket', {
      bucketName: `autnio-${appEnv}-vision-frames`,
      autoDeleteObjects: appEnv !== 'prod',
      removalPolicy: appEnv === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [{ expiration: cdk.Duration.days(1) }],
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        maxAge: 3000,
      }],
    });

    const commonEnv: Record<string, string> = {
      APP_ENV: appEnv,
      DYNAMODB_TABLE: table.tableName,
      COGNITO_USER_POOL_ID: userPool.userPoolId,
      SECRETS_PREFIX: secretsPrefix,
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      VISION_BUCKET: this.visionBucket.bucketName,
      QWEN_VL_MODEL_ID: 'qwen.qwen3-vl-235b-a22b',
      NEMOTRON_VL_MODEL_ID: 'nvidia.nemotron-nano-12b-v2',
    };

    // Base role shared by most Lambdas
    const defaultLambdaRole = new iam.Role(this, 'LambdaBaseRole', {
      roleName: `autnio-${appEnv}-lambda-base`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    defaultLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:/autnio/${appEnv}/*`],
    }));

    // Dedicated role for voice Lambdas (Transcribe + Polly)
    const voiceLambdaRole = new iam.Role(this, 'VoiceLambdaRole', {
      roleName: `autnio-${appEnv}-lambda-voice`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        TranscribePolicy: new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: ['transcribe:StartStreamTranscription'],
            resources: ['*'],
          })],
        }),
        PollyPolicy: new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: ['polly:SynthesizeSpeech'],
            resources: ['*'],
          })],
        }),
      },
    });

    const mkFn = (
      id: string,
      handler: string,
      assetDir: string,
      extraEnv?: Record<string, string>,
      extraPolicies?: iam.PolicyStatement[],
      role?: iam.IRole,
    ): lambda.Function => {
      const fn = new lambda.Function(this, id, {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler,
        code: lambda.Code.fromAsset(path.join(__dirname, '../../functions', assetDir)),
        environment: { ...commonEnv, ...extraEnv },
        role: role ?? defaultLambdaRole,
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        functionName: `autnio-${appEnv}-${id.toLowerCase().replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`,
        logRetention: logs.RetentionDays.TWO_WEEKS,
      });
      extraPolicies?.forEach(p => fn.addToRolePolicy(p));
      table.grantReadWriteData(fn);
      return fn;
    };

    // ── Automation (Dev 2) ────────────────────────────────────────────────
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

    // Open Interpreter dispatch — needs WS ManageConnections + WEBSOCKET_API_ENDPOINT
    // env var WEBSOCKET_API_ENDPOINT is injected in bin/autnio.ts after WsStack is created
    const dispatchOI = mkFn('DispatchOI', 'dispatch.handler', 'automation', {}, [
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [`arn:aws:execute-api:${this.region}:${this.account}:*/@connections/*`],
      }),
    ]);

    // Bedrock Agent proxy (POST /chat) — BEDROCK_AGENT_ID/ALIAS injected in bin/autnio.ts
    const chatAgent = mkFn('ChatAgent', 'chat.handler', 'automation', {}, [
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeAgent'],
        resources: [`arn:aws:bedrock:${this.region}:${this.account}:agent-alias/*/*`],
      }),
    ]);

    // ── WebSocket relay Lambdas (Dev 3) ───────────────────────────────────
    const wsConnect = mkFn('WsConnect', 'ws-connect.handler', 'automation');
    const wsDisconnect = mkFn('WsDisconnect', 'ws-disconnect.handler', 'automation');
    // wsDefault relays messages back to connected clients
    // WEBSOCKET_API_ENDPOINT injected in bin/autnio.ts
    const wsDefault = mkFn('WsDefault', 'ws-default.handler', 'automation', {}, [
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [`arn:aws:execute-api:${this.region}:${this.account}:*/@connections/*`],
      }),
    ]);

    // ── Files (Dev 2) ────────────────────────────────────────────────────
    const boxRead = mkFn('BoxRead', 'box-read.handler', 'files');
    const boxWrite = mkFn('BoxWrite', 'box-write.handler', 'files');

    // ── User / Profile (Dev 2) ───────────────────────────────────────────
    const getProfile = mkFn('GetProfile', 'get-profile.handler', 'user');
    const updateProfile = mkFn('UpdateProfile', 'update-profile.handler', 'user');

    // ── Vision (Dev 4) ───────────────────────────────────────────────────
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

    const bedrockVisionPolicy = new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/qwen.qwen3-vl-235b-a22b`,
        `arn:aws:bedrock:${this.region}::foundation-model/nvidia.nemotron-nano-12b-v2`,
      ],
    });

    const pollyPolicy = new iam.PolicyStatement({
      actions: ['polly:SynthesizeSpeech'],
      resources: ['*'],
    });

    const analyzeImage = mkFn('AnalyzeImage', 'analyze-image.handler', 'vision', {}, [visionPolicy, bedrockVisionPolicy]);
    const extractText = mkFn('ExtractText', 'extract-text.handler', 'vision', {}, [visionPolicy, bedrockVisionPolicy]);
    const synthesizeSpeech = mkFn('SynthesizeSpeech', 'synthesize-speech.handler', 'vision', {}, [pollyPolicy]);

    // Generates pre-signed S3 PUT URLs so the browser can upload camera frames directly
    const uploadUrl = mkFn('UploadUrl', 'upload-url.handler', 'vision');
    this.visionBucket.grantPut(uploadUrl);
    this.visionBucket.grantRead(analyzeImage);
    this.visionBucket.grantRead(extractText);

    // ── Voice (Dev 5) ────────────────────────────────────────────────────
    const transcribe = mkFn('Transcribe', 'transcribe.handler', 'voice', {}, [], voiceLambdaRole);
    const tts = mkFn('Tts', 'tts.handler', 'voice', {}, [], voiceLambdaRole);

    this.exportedFunctions = {
      sendEmail, triggerApify, checkApifyRun, dispatchOI,
      chatAgent, wsConnect, wsDisconnect, wsDefault,
      boxRead, boxWrite,
      getProfile, updateProfile,
      analyzeImage, extractText, synthesizeSpeech, uploadUrl,
      transcribe, tts,
    };

    // ── Outputs ──────────────────────────────────────────────────────────
    const fnOutputs: [string, lambda.Function][] = [
      ['SendEmailArn', sendEmail],
      ['TriggerApifyArn', triggerApify],
      ['CheckApifyRunArn', checkApifyRun],
      ['DispatchOIArn', dispatchOI],
      ['ChatAgentArn', chatAgent],
      ['BoxReadArn', boxRead],
      ['BoxWriteArn', boxWrite],
      ['GetProfileArn', getProfile],
      ['UpdateProfileArn', updateProfile],
      ['AnalyzeImageArn', analyzeImage],
      ['ExtractTextArn', extractText],
      ['SynthesizeSpeechArn', synthesizeSpeech],
      ['UploadUrlArn', uploadUrl],
      ['TranscribeArn', transcribe],
      ['TtsArn', tts],
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

    new cdk.CfnOutput(this, 'VoiceLambdaRoleArn', {
      value: voiceLambdaRole.roleArn,
      exportName: `autnio-${appEnv}-lambda-voice-role-arn`,
      description: 'Voice Lambda IAM role ARN (Transcribe + Polly) — share with Dev 5',
    });

    new cdk.CfnOutput(this, 'VisionBucketName', {
      value: this.visionBucket.bucketName,
      exportName: `autnio-${appEnv}-vision-bucket`,
      description: 'S3 bucket for vision frame uploads — share with Dev 4',
    });
  }
}
