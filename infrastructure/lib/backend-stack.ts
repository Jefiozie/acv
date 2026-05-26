import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import * as path from 'path';

export interface BackendStackProps extends cdk.StackProps {
  table: dynamodb.TableV2;
  sesConfigSetName: string;
  sesFromAddress: string;
}

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const checkerFn = new lambdaNode.NodejsFunction(this, 'CheckerFunction', {
      entry: path.join(__dirname, '../../backend/src/checker/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),
      projectRoot: path.join(__dirname, '../..'),
      depsLockFilePath: path.join(__dirname, '../../backend/package-lock.json'),
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'node22',
      },
      environment: {
        TABLE_NAME: props.table.tableName,
        SES_FROM_ADDRESS: props.sesFromAddress,
        SES_CONFIG_SET: props.sesConfigSetName,
        LOOKAHEAD_DAYS: '14',
      },
    });
    props.table.grantReadWriteData(checkerFn);

    new events.Rule(this, 'CheckerSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(10)),
      targets: [new targets.LambdaFunction(checkerFn)],
    });

    const apiFn = new lambdaNode.NodejsFunction(this, 'ApiFunction', {
      entry: path.join(__dirname, '../../backend/src/api/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      projectRoot: path.join(__dirname, '../..'),
      depsLockFilePath: path.join(__dirname, '../../backend/package-lock.json'),
      bundling: {
        minify: true,
        target: 'node22',
      },
      environment: {
        TABLE_NAME: props.table.tableName,
        SES_FROM_ADDRESS: props.sesFromAddress,
        SES_CONFIG_SET: props.sesConfigSetName,
        FRONTEND_URL: 'https://acv-aanhanger.nl',
      },
    });
    props.table.grantReadWriteData(apiFn);

    const httpApi = new apigatewayv2.HttpApi(this, 'AcvApi', {
      corsPreflight: {
        allowOrigins: ['https://acv-aanhanger.nl', 'http://localhost:4200'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type'],
        maxAge: cdk.Duration.days(1),
      },
    });

    const apiIntegration = new HttpLambdaIntegration('ApiIntegration', apiFn);

    httpApi.addRoutes({ path: '/subscribe', methods: [apigatewayv2.HttpMethod.POST], integration: apiIntegration });
    httpApi.addRoutes({ path: '/confirm', methods: [apigatewayv2.HttpMethod.GET], integration: apiIntegration });
    httpApi.addRoutes({ path: '/unsubscribe', methods: [apigatewayv2.HttpMethod.GET], integration: apiIntegration });

    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.url ?? '' });
  }
}

