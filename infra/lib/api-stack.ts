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
      description: 'Autnio main API',
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

    // Cognito JWT authorizer — all routes require a valid token by default
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

    // ── /profile ─────────────────────────────────────────────────────────────
    const profileResource = this.api.root.addResource('profile');
    profileResource.addMethod('GET', mkIntegration(functions.getProfile), defaultMethodOptions);
    profileResource.addMethod('PUT', mkIntegration(functions.updateProfile), defaultMethodOptions);

    // ── /automation ──────────────────────────────────────────────────────────
    const automationResource = this.api.root.addResource('automation');

    const emailResource = automationResource.addResource('email');
    emailResource.addMethod('POST', mkIntegration(functions.sendEmail), defaultMethodOptions);

    const apifyResource = automationResource.addResource('apify');
    apifyResource.addMethod('POST', mkIntegration(functions.triggerApify), defaultMethodOptions);
    const apifyRunResource = apifyResource.addResource('{runId}');
    apifyRunResource.addMethod('GET', mkIntegration(functions.checkApifyRun), defaultMethodOptions);

    // ── /files ───────────────────────────────────────────────────────────────
    const filesResource = this.api.root.addResource('files');
    filesResource.addMethod('GET', mkIntegration(functions.boxRead), defaultMethodOptions);
    filesResource.addMethod('POST', mkIntegration(functions.boxWrite), defaultMethodOptions);

    // ── /vision ──────────────────────────────────────────────────────────────
    const visionResource = this.api.root.addResource('vision');
    visionResource.addResource('image').addMethod('POST', mkIntegration(functions.analyzeImage), defaultMethodOptions);
    visionResource.addResource('text').addMethod('POST', mkIntegration(functions.extractText), defaultMethodOptions);
    visionResource.addResource('speech').addMethod('POST', mkIntegration(functions.synthesizeSpeech), defaultMethodOptions);

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      exportName: `autnio-${appEnv}-api-endpoint`,
      description: 'API Gateway base URL — share with Dev 4 (mobile/glasses client)',
    });
    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      exportName: `autnio-${appEnv}-api-id`,
    });
  }
}
