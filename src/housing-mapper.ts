/**
 * Housing mapper — provides access to Center Parcs housing code → formatted name mappings.
 * These mappings are collected from the scraper and stored in the cache.
 * The API and frontend can use this to display proper housing names.
 */

import { getHousingMappings, getHousingName } from "./check-centerparcs.js";

/**
 * Export all cached housing code → formatted name mappings.
 * Useful for the API to return a complete mapping or for the frontend to display names.
 * 
 * @returns Record<code, formattedName> e.g., { "HB1932": "Comfort Safarilodge — Houten safarilodge", ... }
 */
export function getHousingCodeMappings() {
  return getHousingMappings();
}

/**
 * Get the formatted name for a specific housing code.
 * 
 * @param code - The housing code (e.g., "HB1932")
 * @returns The formatted display name (e.g., "Comfort Safarilodge — Houten safarilodge") or undefined
 */
export function getFormattedHousingName(code: string): string | undefined {
  return getHousingName(code);
}

/**
 * Map cottage codes to their formatted names in a data structure.
 * Useful for transforming API responses or cache data.
 * 
 * @param codes - Array of housing codes
 * @returns Record mapping codes to formatted names (missing codes omitted)
 */
export function mapCodesToNames(codes: string[]): Record<string, string> {
  const mappings = getHousingCodeMappings();
  const result: Record<string, string> = {};
  
  for (const code of codes) {
    if (mappings[code]) {
      result[code] = mappings[code];
    }
  }
  
  return result;
}
