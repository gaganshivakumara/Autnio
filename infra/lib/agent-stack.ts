import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { ExportedFunctions } from './functions-stack';

interface AgentStackProps extends cdk.StackProps {
  appEnv: string;
  functions: ExportedFunctions;
}

// Dev 1 owns the Bedrock Agent configuration, prompt schemas, and action group
// definitions. This stack provisions the IAM role and grants invoke permissions
// so Dev 1 can wire up the agent without needing AWS console access.
export class AgentStack extends cdk.Stack {
  readonly agentRole: iam.Role;

  constructor(scope: Construct, id: string, props: AgentStackProps) {
    super(scope, id, props);

    const { appEnv, functions } = props;

    // IAM role that the Bedrock Agent assumes when invoking action group Lambdas
    this.agentRole = new iam.Role(this, 'BedrockAgentRole', {
      roleName: `autnio-${appEnv}-bedrock-agent`,
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Role assumed by Bedrock Agent to call action group Lambdas',
    });

    this.agentRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BedrockModelAccess',
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        ],
      }),
    );

    // Grant the agent role permission to invoke each action group Lambda
    const allFunctions: lambda.Function[] = Object.values(functions);

    allFunctions.forEach((fn) => {
      fn.grantInvoke(this.agentRole);
    });

    // Allow each Lambda to add a resource-based policy so Bedrock can call it
    this.agentRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'LambdaInvokeAll',
        actions: ['lambda:InvokeFunction'],
        resources: allFunctions.map((fn) => fn.functionArn),
      }),
    );

    new cdk.CfnOutput(this, 'AgentRoleArn', {
      value: this.agentRole.roleArn,
      exportName: `autnio-${appEnv}-bedrock-agent-role-arn`,
      description: 'Bedrock Agent IAM role ARN — share with Dev 1',
    });

    // Placeholder outputs Dev 1 will fill in after creating the agent
    new cdk.CfnOutput(this, 'BedrockAgentIdPlaceholder', {
      value: 'SET_BY_DEV1',
      exportName: `autnio-${appEnv}-bedrock-agent-id`,
      description: 'Dev 1: replace with actual Bedrock Agent ID after creation',
    });
    new cdk.CfnOutput(this, 'BedrockAgentAliasPlaceholder', {
      value: 'SET_BY_DEV1',
      exportName: `autnio-${appEnv}-bedrock-agent-alias-id`,
      description: 'Dev 1: replace with actual Bedrock Agent Alias ID',
    });
  }
}
