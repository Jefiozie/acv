import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ses from 'aws-cdk-lib/aws-ses';
import { Construct } from 'constructs';

export interface StatefulStackProps extends cdk.StackProps {}

export class StatefulStack extends cdk.Stack {
  public readonly table: dynamodb.TableV2;
  public readonly configSetName: string;

  constructor(scope: Construct, id: string, props?: StatefulStackProps) {
    super(scope, id, props);

    this.table = new dynamodb.TableV2(this, 'SubscriptionsTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI1: all confirmed subscribers for a township (sparse — populated on confirm)
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ['confirmed', 'frequency'],
    });

    // GSI2: subscriber by unsubscribe token (always populated at subscribe time)
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    new ses.EmailIdentity(this, 'SenderIdentity', {
      identity: ses.Identity.domain('acv-aanhanger.nl'),
    });

    const configSet = new ses.ConfigurationSet(this, 'SesConfigSet', {
      configurationSetName: 'AcvNotifications',
      suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
      reputationMetrics: true,
      sendingEnabled: true,
    });
    this.configSetName = configSet.configurationSetName!;

    new cdk.CfnOutput(this, 'TableName', { value: this.table.tableName });
    new cdk.CfnOutput(this, 'TableArn', { value: this.table.tableArn });
    new cdk.CfnOutput(this, 'ConfigSetName', { value: this.configSetName });
  }
}

