import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { Construct } from 'constructs';

interface AuthStackProps extends cdk.StackProps {
  appEnv: string;
}

export class AuthStack extends cdk.Stack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly identityPool: cognito.CfnIdentityPool;
  readonly authenticatedRole: iam.Role;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { appEnv } = props;

    // Post-confirmation trigger: creates DynamoDB profile record via Dev 2's create-profile handler
    const postConfirmationFn = new lambda.Function(this, 'PostConfirmationTrigger', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'create-profile.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../functions/user')),
      environment: {
        APP_ENV: appEnv,
      },
      functionName: `autnio-${appEnv}-post-confirmation`,
      timeout: cdk.Duration.seconds(10),
    });

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `autnio-${appEnv}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: false },
        preferredUsername: { required: false, mutable: true },
      },
      customAttributes: {
        preferred_name: new cognito.StringAttribute({ mutable: true, maxLen: 100 }),
        glasses_connected: new cognito.BooleanAttribute({ mutable: true }),
        accessibility_mode: new cognito.BooleanAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      lambdaTriggers: {
        postConfirmation: postConfirmationFn,
      },
      removalPolicy: appEnv === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `autnio-${appEnv}-web`,
      authFlows: {
        userSrp: true,
        userPassword: false,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `autnio_${appEnv}`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    this.authenticatedRole = new iam.Role(this, 'AuthenticatedRole', {
      roleName: `autnio-${appEnv}-cognito-authenticated`,
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      description: 'Role assumed by authenticated Autnio users',
    });

    const unauthenticatedRole = new iam.Role(this, 'UnauthenticatedRole', {
      roleName: `autnio-${appEnv}-cognito-unauthenticated`,
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'unauthenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      description: 'Unauthenticated role - no permissions granted',
    });

    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoles', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: this.authenticatedRole.roleArn,
        unauthenticated: unauthenticatedRole.roleArn,
      },
    });

    // Outputs for other stacks and team handoff
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `autnio-${appEnv}-user-pool-id`,
      description: 'Cognito User Pool ID — share with Dev 1, Dev 4',
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: `autnio-${appEnv}-user-pool-client-id`,
      description: 'Cognito App Client ID — share with Dev 4 (mobile)',
    });
    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      exportName: `autnio-${appEnv}-identity-pool-id`,
      description: 'Cognito Identity Pool ID — share with Dev 1, Dev 4',
    });
    new cdk.CfnOutput(this, 'UserPoolProviderUrl', {
      value: this.userPool.userPoolProviderUrl,
      exportName: `autnio-${appEnv}-user-pool-provider-url`,
    });
  }
}
