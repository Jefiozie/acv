import { render, screen } from '@testing-library/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { UnsubscribeComponent } from './unsubscribe.component';

describe('UnsubscribeComponent', () => {
  const defaultProviders = [
    provideHttpClient(),
    provideHttpClientTesting(),
    provideRouter([]),
  ];

  it('calls GET /api/unsubscribe with unsub-token on init', async () => {
    await render(UnsubscribeComponent, {
      componentInputs: { token: 'unsub-token' },
      providers: defaultProviders,
    });
    const httpMock = TestBed.inject(HttpTestingController);
    const req = httpMock.expectOne(
      (r) => r.url === '/api/unsubscribe' && r.params.get('token') === 'unsub-token'
    );
    expect(req.request.method).toBe('GET');
    req.flush({});
    httpMock.verify();
  });

  it('shows success message when GET returns 200', async () => {
    const { fixture } = await render(UnsubscribeComponent, {
      componentInputs: { token: 'unsub-token' },
      providers: defaultProviders,
    });
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne((r) => r.url === '/api/unsubscribe').flush({});
    fixture.detectChanges();
    expect(screen.getByText(/Je bent uitgeschreven/)).toBeTruthy();
    httpMock.verify();
  });

  it('shows Dutch error message on 400/404 response', async () => {
    const { fixture } = await render(UnsubscribeComponent, {
      componentInputs: { token: 'unsub-token' },
      providers: defaultProviders,
    });
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne((r) => r.url === '/api/unsubscribe')
      .flush({ message: 'not found' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(screen.getByText(/Dit uitschrijflink is al gebruikt of ongeldig/)).toBeTruthy();
    httpMock.verify();
  });

  it('shows error state immediately without HTTP call when token is empty', async () => {
    await render(UnsubscribeComponent, {
      componentInputs: { token: '' },
      providers: defaultProviders,
    });
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.verify(); // throws if any unexpected pending requests exist
    expect(screen.getByText(/Dit uitschrijflink is al gebruikt of ongeldig/)).toBeTruthy();
  });
});
