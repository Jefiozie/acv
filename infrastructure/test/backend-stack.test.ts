import { describe, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { StatefulStack } from '../lib/stateful-stack';
import { BackendStack } from '../lib/backend-stack';

describe('BackendStack', () => {
  const app = new cdk.App();
  const stateful = new StatefulStack(app, 'TestStatefulStack');
  const stack = new BackendStack(app, 'TestBackendStack', {
    table: stateful.table,
    sesConfigSetName: stateful.configSetName,
    sesFromAddress: 'noreply@acv-aanhanger.nl',
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const template = Template.fromStack(stack);

  describe('EventBridge 10-minute rule', () => {
    it.todo('plan 01-04: asserts CheckerSchedule rule with 10-minute rate');
  });

  describe('HttpApi', () => {
    it.todo('plan 01-04: asserts HTTP API v2 with three routes');
  });
});
