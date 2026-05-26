import * as cdk from 'aws-cdk-lib';
import { StatefulStack } from '../lib/stateful-stack';
import { BackendStack } from '../lib/backend-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'eu-central-1',
};

const stateful = new StatefulStack(app, 'AcvStateful', { env, terminationProtection: true });

new BackendStack(app, 'AcvBackend', {
  env,
  table: stateful.table,
  sesConfigSetName: stateful.configSetName,
  sesFromAddress: 'noreply@acv-aanhanger.nl',
});
