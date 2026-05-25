import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/**
 * Mock API interceptor.
 *
 * When `environment.useMockApi` is false (production), this interceptor is not
 * registered at all (see app.config.ts). When `useMockApi` is true (development),
 * full mock responses are returned for all three API endpoints.
 *
 * The module-level Set persists subscribed emails across requests within the same
 * page session, enabling 409 Conflict simulation for duplicate subscription attempts.
 */
const subscribedEmails = new Set<string>();

export const mockApiInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  if (!environment.useMockApi) {
    return next(req);
  }

  // POST /api/subscribe
  if (req.method === 'POST' && req.url.includes('/api/subscribe')) {
    const body = req.body as { email: string };
    if (subscribedEmails.has(body.email)) {
      return of(new HttpResponse({ status: 409, body: { message: 'Already subscribed' } })).pipe(delay(400));
    }
    subscribedEmails.add(body.email);
    return of(new HttpResponse({ status: 200, body: null })).pipe(delay(400));
  }

  // GET /api/confirm
  if (req.method === 'GET' && req.url.includes('/api/confirm')) {
    const token = req.params.get('token');
    if (token === 'invalid' || token === 'expired') {
      return of(new HttpResponse({ status: 400, body: { message: 'Invalid token' } })).pipe(delay(400));
    }
    return of(new HttpResponse({ status: 200, body: null })).pipe(delay(400));
  }

  // GET /api/unsubscribe
  if (req.method === 'GET' && req.url.includes('/api/unsubscribe')) {
    return of(new HttpResponse({ status: 200, body: null })).pipe(delay(400));
  }

  return next(req);
};
