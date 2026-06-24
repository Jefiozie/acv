import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { readFileSync } from 'fs';
import { join } from 'path';

interface CachedCottage {
  firstSeen: string;
  latestPromoPrice: string | null;
  latestOriginalPrice: string;
  history: Array<{
    date: string;
    originalPrice: string;
    promoPrice: string | null;
    discount: number | null;
    stock: number;
  }>;
  formattedName: string;
}

type StateCache = Record<string, CachedCottage>;

/**
 * Load housing mappings from cache file.
 * Returns a mapping of housing codes to formatted display names.
 */
function getHousingMappings(): Record<string, string> {
  try {
    // Cache file is at the project root, accessible from Lambda's working directory
    const cacheContent = readFileSync('centerparcs_cache.json', 'utf-8');
    const cache = JSON.parse(cacheContent) as StateCache;
    
    const mappings: Record<string, string> = {};
    for (const [code, cottage] of Object.entries(cache)) {
      if (cottage.formattedName) {
        mappings[code] = cottage.formattedName;
      }
    }
    return mappings;
  } catch (error) {
    console.error('Failed to load housing mappings:', error);
    return {};
  }
}

// TODO Phase 2: subscribe / confirm / unsubscribe routes
export async function handler(
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> {
  const routeKey = event.routeKey || '';
  
  // GET /housing-mappings — returns code → formatted name mappings
  if (routeKey === 'GET /housing-mappings') {
    const mappings = getHousingMappings();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mappings,
        lastUpdated: new Date().toISOString(),
      }),
    };
  }

  console.log('ApiLambda placeholder — Phase 1', { routeKey });
  return { statusCode: 501, body: JSON.stringify({ message: 'Not implemented yet' }) };
}
