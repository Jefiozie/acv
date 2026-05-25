import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { SubscribeRequest } from '../models/subscription.model';

/**
 * Handles API communication for the subscription feature.
 * Uses relative URL `/api/subscribe` — CloudFront proxies `/api/*` in production;
 * the mock interceptor intercepts `/api/*` in local development.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly http = inject(HttpClient);

  /**
   * Posts a subscription request to the backend.
   * @param data The validated form data containing email, townshipId, and frequency.
   * @returns Observable that completes when the subscription is created.
   */
  subscribe(data: SubscribeRequest): Observable<void> {
    return this.http.post<void>('/api/subscribe', data);
  }
}
