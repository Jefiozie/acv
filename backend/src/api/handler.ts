import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

// TODO Phase 2: subscribe / confirm / unsubscribe routes
export async function handler(
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> {
  console.log('ApiLambda placeholder — Phase 1', { routeKey: event.routeKey });
  return { statusCode: 501, body: JSON.stringify({ message: 'Not implemented yet' }) };
}
