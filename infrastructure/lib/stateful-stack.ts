import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface StatefulStackProps extends cdk.StackProps {}

export class StatefulStack extends cdk.Stack {
  public readonly table!: dynamodb.TableV2;
  public readonly configSetName!: string;

  constructor(scope: Construct, id: string, props?: StatefulStackProps) {
    super(scope, id, props);
    // Full implementation: plan 01-02
  }
}
