import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { ExportedFunctions } from './functions-stack';

interface MonitoringStackProps extends cdk.StackProps {
  appEnv: string;
  functions: ExportedFunctions;
  api: apigateway.RestApi;
  table: dynamodb.Table;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { appEnv, functions, api, table } = props;

    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `autnio-${appEnv}-alerts`,
      displayName: `Autnio ${appEnv} Alerts`,
    });

    // Update this with your team's oncall email
    alertTopic.addSubscription(
      new sns_subscriptions.EmailSubscription('alerts@autnio.app'),
    );

    const alarmAction = new cloudwatch_actions.SnsAction(alertTopic);

    // ── Lambda alarms ────────────────────────────────────────────────────────
    const allFunctions = Object.entries(functions) as [string, lambda.Function][];

    allFunctions.forEach(([name, fn]) => {
      const errorAlarm = new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
        alarmName: `autnio-${appEnv}-${name}-errors`,
        metric: fn.metricErrors({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 3,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `${name} Lambda errors ≥ 3 in 5 minutes`,
      });
      errorAlarm.addAlarmAction(alarmAction);

      const throttleAlarm = new cloudwatch.Alarm(this, `${name}ThrottleAlarm`, {
        alarmName: `autnio-${appEnv}-${name}-throttles`,
        metric: fn.metricThrottles({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 5,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `${name} Lambda throttles ≥ 5 in 5 minutes`,
      });
      throttleAlarm.addAlarmAction(alarmAction);
    });

    // ── API Gateway alarms ───────────────────────────────────────────────────
    const api5xxAlarm = new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      alarmName: `autnio-${appEnv}-api-5xx`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: {
          ApiName: api.restApiName,
          Stage: appEnv,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'API Gateway 5xx errors ≥ 5 in 5 minutes',
    });
    api5xxAlarm.addAlarmAction(alarmAction);

    const apiLatencyAlarm = new cloudwatch.Alarm(this, 'ApiLatencyAlarm', {
      alarmName: `autnio-${appEnv}-api-latency-p99`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'IntegrationLatency',
        dimensionsMap: {
          ApiName: api.restApiName,
          Stage: appEnv,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'p99',
      }),
      threshold: 10000,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'API Gateway p99 latency > 10s for 10 minutes',
    });
    apiLatencyAlarm.addAlarmAction(alarmAction);

    // ── DynamoDB alarms ──────────────────────────────────────────────────────
    const ddbThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoThrottleAlarm', {
      alarmName: `autnio-${appEnv}-dynamodb-throttles`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ThrottledRequests',
        dimensionsMap: { TableName: table.tableName },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'DynamoDB throttling detected',
    });
    ddbThrottleAlarm.addAlarmAction(alarmAction);

    // ── CloudWatch Dashboard ─────────────────────────────────────────────────
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `autnio-${appEnv}`,
    });

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# Autnio ${appEnv.toUpperCase()} — Ops Dashboard`,
        width: 24,
        height: 1,
      }),
    );

    // Lambda error/duration row
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors (all functions)',
        width: 12,
        left: allFunctions.map(([, fn]) =>
          fn.metricErrors({ period: cdk.Duration.minutes(1), statistic: 'Sum' }),
        ),
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration p99 (all functions)',
        width: 12,
        left: allFunctions.map(([, fn]) =>
          fn.metricDuration({ period: cdk.Duration.minutes(1), statistic: 'p99' }),
        ),
      }),
    );

    // API row
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway — Request Count',
        width: 8,
        left: [new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Count',
          dimensionsMap: { ApiName: api.restApiName, Stage: appEnv },
          period: cdk.Duration.minutes(1),
          statistic: 'Sum',
        })],
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway — 4xx / 5xx',
        width: 8,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '4XXError',
            dimensionsMap: { ApiName: api.restApiName, Stage: appEnv },
            period: cdk.Duration.minutes(1),
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '5XXError',
            dimensionsMap: { ApiName: api.restApiName, Stage: appEnv },
            period: cdk.Duration.minutes(1),
            statistic: 'Sum',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway — Latency p99',
        width: 8,
        left: [new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'IntegrationLatency',
          dimensionsMap: { ApiName: api.restApiName, Stage: appEnv },
          period: cdk.Duration.minutes(1),
          statistic: 'p99',
        })],
      }),
    );

    // DynamoDB row
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB — Consumed RCU / WCU',
        width: 12,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ConsumedReadCapacityUnits',
            dimensionsMap: { TableName: table.tableName },
            period: cdk.Duration.minutes(1),
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ConsumedWriteCapacityUnits',
            dimensionsMap: { TableName: table.tableName },
            period: cdk.Duration.minutes(1),
            statistic: 'Sum',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB — Throttled Requests',
        width: 12,
        left: [new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ThrottledRequests',
          dimensionsMap: { TableName: table.tableName },
          period: cdk.Duration.minutes(1),
          statistic: 'Sum',
        })],
      }),
    );
  }
}
