import { ScheduledEvent, Context } from 'aws-lambda';

// TODO Phase 2: ACV scrape + DynamoDB diff + SES fan-out
export async function handler(event: ScheduledEvent, context: Context): Promise<void> {
  console.log('CheckerLambda placeholder — Phase 1', { requestId: context.awsRequestId });
}
