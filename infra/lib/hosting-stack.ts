import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

interface HostingStackProps extends cdk.StackProps {
  appEnv: string;
}

export class HostingStack extends cdk.Stack {
  readonly distribution: cloudfront.Distribution;
  readonly webBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: HostingStackProps) {
    super(scope, id, props);

    const { appEnv } = props;

    this.webBucket = new s3.Bucket(this, 'WebAppBucket', {
      bucketName: `autnio-${appEnv}-webapp`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: appEnv !== 'prod',
      removalPolicy: appEnv === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Origin Access Identity so CloudFront can read from the private bucket
    const oai = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: `Autnio ${appEnv} web app OAI`,
    });
    this.webBucket.grantRead(oai);

    this.distribution = new cloudfront.Distribution(this, 'WebAppCDN', {
      defaultBehavior: {
        origin: new origins.S3Origin(this.webBucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      defaultRootObject: 'index.html',
      // SPA fallback — return index.html for all 403/404 so React Router works
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    new cdk.CfnOutput(this, 'WebAppUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      exportName: `autnio-${appEnv}-webapp-url`,
      description: 'CloudFront web app URL — share with Dev 4 (VITE_APP_URL), update Cognito OAuth callback',
    });

    new cdk.CfnOutput(this, 'WebBucketName', {
      value: this.webBucket.bucketName,
      exportName: `autnio-${appEnv}-webapp-bucket`,
      description: 'S3 bucket for web app — Dev 4 runs: npm run build && aws s3 sync dist/ s3://<bucket>',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      exportName: `autnio-${appEnv}-distribution-id`,
      description: 'CloudFront distribution ID — needed to invalidate cache after web app deploy',
    });
  }
}
