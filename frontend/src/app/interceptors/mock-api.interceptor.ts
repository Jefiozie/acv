import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

/**
 * Mock API interceptor.
 *
 * When `environment.useMockApi` is false (production), this interceptor is not
 * registered at all (see app.config.ts). When `useMockApi` is true (development),
 * full mock responses are wired in plan 03-04. For now the skeleton passes
 * through to `next(req)`.
 */
export const mockApiInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  if (!environment.useMockApi) {
    return next(req);
  }

  // TODO(plan 03-04): Add mock response handlers per endpoint.
  return next(req);
};
