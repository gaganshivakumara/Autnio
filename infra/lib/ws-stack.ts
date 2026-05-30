import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';
import { ExportedFunctions } from './functions-stack';

interface WsStackProps extends cdk.StackProps {
  appEnv: string;
  functions: ExportedFunctions;
}

export class WsStack extends cdk.Stack {
  // wss:// URL — used by the browser (Dev 4 web app)
  readonly wsApiUrl: string;
  // https:// management URL — used by Lambda ManageConnections (Dev 2 dispatch)
  readonly wsCallbackUrl: string;

  constructor(scope: Construct, id: string, props: WsStackProps) {
    super(scope, id, props);

    const { appEnv, functions } = props;

    const wsApi = new apigwv2.WebSocketApi(this, 'WsApi', {
      apiName: `autnio-${appEnv}-ws`,
      description: 'Autnio WebSocket API — Open Interpreter relay',
      connectRouteOptions: {
        integration: new apigwv2_integrations.WebSocketLambdaIntegration(
          'WsConnectIntegration',
          functions.wsConnect,
        ),
      },
      disconnectRouteOptions: {
        integration: new apigwv2_integrations.WebSocketLambdaIntegration(
          'WsDisconnectIntegration',
          functions.wsDisconnect,
        ),
      },
      defaultRouteOptions: {
        integration: new apigwv2_integrations.WebSocketLambdaIntegration(
          'WsDefaultIntegration',
          functions.wsDefault,
        ),
      },
    });

    const wsStage = new apigwv2.WebSocketStage(this, 'WsStage', {
      webSocketApi: wsApi,
      stageName: appEnv,
      autoDeploy: true,
    });

    this.wsApiUrl = wsStage.url;
    this.wsCallbackUrl = wsStage.callbackUrl;

    new cdk.CfnOutput(this, 'WsApiUrl', {
      value: wsStage.url,
      exportName: `autnio-${appEnv}-ws-api-url`,
      description: 'WebSocket URL (wss://) — share with Dev 2 (WEBSOCKET_CLIENT_URL) and Dev 4 (VITE_WS_API_URL)',
    });

    new cdk.CfnOutput(this, 'WsCallbackUrl', {
      value: wsStage.callbackUrl,
      exportName: `autnio-${appEnv}-ws-callback-url`,
      description: 'WebSocket management URL (https://) — set as WEBSOCKET_API_ENDPOINT on dispatch Lambda',
    });

    new cdk.CfnOutput(this, 'WsApiId', {
      value: wsApi.apiId,
      exportName: `autnio-${appEnv}-ws-api-id`,
    });
  }
}
