import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface BackendStackProps extends cdk.StackProps {
  table: dynamodb.TableV2;
  sesConfigSetName: string;
  sesFromAddress: string;
}

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);
    // Full implementation: plan 01-04
  }
}
