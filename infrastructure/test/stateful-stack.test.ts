import { describe, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { StatefulStack } from '../lib/stateful-stack';

describe('StatefulStack', () => {
  const app = new cdk.App();
  const stack = new StatefulStack(app, 'TestStatefulStack');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const template = Template.fromStack(stack);

  describe('GSI1', () => {
    it.todo('plan 01-02: asserts GSI1 (confirmed-subscriber fan-out)');
  });

  describe('GSI2', () => {
    it.todo('plan 01-02: asserts GSI2 (unsubscribe token lookup)');
  });

  describe('RemovalPolicy', () => {
    it.todo('plan 01-02: asserts table has RETAIN removal policy');
  });

  describe('SES suppression', () => {
    it.todo('plan 01-02: asserts SES suppression list enabled');
  });
});
