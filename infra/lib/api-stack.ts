import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { ExportedFunctions } from './functions-stack';

interface ApiStackProps extends cdk.StackProps {
  appEnv: string;
  userPool: cognito.UserPool;
  functions: ExportedFunctions;
}

export class ApiStack extends cdk.Stack {
  readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { appEnv, userPool, functions } = props;

    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: `/autnio/${appEnv}/api-access`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.api = new apigateway.RestApi(this, 'Api', {
      restApiName: `autnio-${appEnv}`,
      description: 'Autnio main REST API',
      deployOptions: {
        stageName: appEnv,
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: appEnv !== 'prod',
        metricsEnabled: true,
        throttlingBurstLimit: 500,
        throttlingRateLimit: 1000,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });

    // Cognito JWT authorizer — all routes require a valid token
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'JwtAuthorizer', {
      authorizerName: `autnio-${appEnv}-jwt`,
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    const defaultMethodOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    const mkIntegration = (fn: cdk.aws_lambda.Function) =>
      new apigateway.LambdaIntegration(fn, {
        proxy: true,
        passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_MATCH,
      });

    // ── /chat — Bedrock Agent proxy (primary AI endpoint) ────────────────
    this.api.root
      .addResource('chat')
      .addMethod('POST', mkIntegration(functions.chatAgent), defaultMethodOptions);

    // ── /profile ─────────────────────────────────────────────────────────
    const profileResource = this.api.root.addResource('profile');
    profileResource.addMethod('GET', mkIntegration(functions.getProfile), defaultMethodOptions);
    profileResource.addMethod('PUT', mkIntegration(functions.updateProfile), defaultMethodOptions);

    // ── /automation ──────────────────────────────────────────────────────
    const automationResource = this.api.root.addResource('automation');

    automationResource.addResource('email')
      .addMethod('POST', mkIntegration(functions.sendEmail), defaultMethodOptions);

    const apifyResource = automationResource.addResource('apify');
    apifyResource.addMethod('POST', mkIntegration(functions.triggerApify), defaultMethodOptions);
    apifyResource.addResource('{runId}')
      .addMethod('GET', mkIntegration(functions.checkApifyRun), defaultMethodOptions);

    // ── /files ───────────────────────────────────────────────────────────
    const filesResource = this.api.root.addResource('files');
    filesResource.addMethod('GET', mkIntegration(functions.boxRead), defaultMethodOptions);
    filesResource.addMethod('POST', mkIntegration(functions.boxWrite), defaultMethodOptions);

    // ── /vision ──────────────────────────────────────────────────────────
    const visionResource = this.api.root.addResource('vision');
    visionResource.addResource('image')
      .addMethod('POST', mkIntegration(functions.analyzeImage), defaultMethodOptions);
    visionResource.addResource('text')
      .addMethod('POST', mkIntegration(functions.extractText), defaultMethodOptions);
    visionResource.addResource('speech')
      .addMethod('POST', mkIntegration(functions.synthesizeSpeech), defaultMethodOptions);

    // Upload pre-signed URL for camera frame → S3 (no body needed, just userId from JWT)
    this.api.root.addResource('upload')
      .addMethod('POST', mkIntegration(functions.uploadUrl), defaultMethodOptions);

    // ── /voice — Dev 5 (Transcribe STT + Polly TTS) ──────────────────────
    const voiceResource = this.api.root.addResource('voice');
    voiceResource.addResource('transcribe')
      .addMethod('POST', mkIntegration(functions.transcribe), defaultMethodOptions);
    voiceResource.addResource('tts')
      .addMethod('POST', mkIntegration(functions.tts), defaultMethodOptions);

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      exportName: `autnio-${appEnv}-api-endpoint`,
      description: 'REST API base URL — share with Dev 4 (web app), Dev 5 (voice)',
    });
    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      exportName: `autnio-${appEnv}-api-id`,
    });
  }
}
