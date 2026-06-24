import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, shareReplay } from 'rxjs/operators';
import { Observable } from 'rxjs';

/**
 * Housing mapper service — fetches and caches housing code → formatted name mappings
 * from the API. Used to display proper housing names throughout the application.
 */

interface HousingMappingsResponse {
  mappings: Record<string, string>;
  lastUpdated: string;
}

@Injectable({
  providedIn: 'root',
})
export class HousingMapperService {
  private readonly http = inject(HttpClient);
  private housingMappings$ = this.http
    .get<HousingMappingsResponse>('/api/housing-mappings')
    .pipe(
      map((response) => response.mappings),
      shareReplay(1), // Cache the result for the lifetime of the app
    );

  /**
   * Get all housing code → formatted name mappings as an observable.
   * The result is cached and shared across all subscribers.
   */
  getMappings(): Observable<Record<string, string>> {
    return this.housingMappings$;
  }

  /**
   * Get the formatted display name for a housing code.
   * @param code - The housing code (e.g., "HB1932")
   * @returns Observable of the formatted name or undefined
   */
  getFormattedName(code: string): Observable<string | undefined> {
    return this.housingMappings$.pipe(
      map((mappings) => mappings[code]),
    );
  }

  /**
   * Get formatted names for multiple housing codes.
   * @param codes - Array of housing codes
   * @returns Observable of a record mapping codes to formatted names
   */
  getFormattedNames(codes: string[]): Observable<Record<string, string>> {
    return this.housingMappings$.pipe(
      map((mappings) => {
        const result: Record<string, string> = {};
        for (const code of codes) {
          if (mappings[code]) {
            result[code] = mappings[code];
          }
        }
        return result;
      }),
    );
  }
}
