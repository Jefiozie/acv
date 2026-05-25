import { render, screen } from '@testing-library/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ConfirmComponent } from './confirm.component';

describe('ConfirmComponent', () => {
  const defaultProviders = [
    provideHttpClient(),
    provideHttpClientTesting(),
    provideRouter([]),
  ];

  it('calls GET /api/confirm with valid-token on init', async () => {
    await render(ConfirmComponent, {
      componentInputs: { token: 'valid-token' },
      providers: defaultProviders,
    });
    const httpMock = TestBed.inject(HttpTestingController);
    const req = httpMock.expectOne(
      (r) => r.url === '/api/confirm' && r.params.get('token') === 'valid-token'
    );
    expect(req.request.method).toBe('GET');
    req.flush({});
    httpMock.verify();
  });

  it('shows success message when GET returns 200', async () => {
    const { fixture } = await render(ConfirmComponent, {
      componentInputs: { token: 'valid-token' },
      providers: defaultProviders,
    });
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne((r) => r.url === '/api/confirm').flush({});
    fixture.detectChanges();
    expect(screen.getByText(/Je aanmelding is bevestigd!/)).toBeTruthy();
    httpMock.verify();
  });

  it('shows Dutch error message on 400 response — no status code in text', async () => {
    const { fixture } = await render(ConfirmComponent, {
      componentInputs: { token: 'valid-token' },
      providers: defaultProviders,
    });
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne((r) => r.url === '/api/confirm')
      .flush({ message: 'bad request' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(screen.getByText(/Ongeldige of verlopen bevestigingslink/)).toBeTruthy();
    expect(screen.queryByText('400')).toBeNull();
    httpMock.verify();
  });

  it('shows error state immediately without HTTP call when token is empty', async () => {
    await render(ConfirmComponent, {
      componentInputs: { token: '' },
      providers: defaultProviders,
    });
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.verify(); // throws if any unexpected pending requests exist
    expect(screen.getByText(/Ongeldige of verlopen bevestigingslink/)).toBeTruthy();
  });

  it('shows loading indicator while GET request is in flight', async () => {
    await render(ConfirmComponent, {
      componentInputs: { token: 'valid-token' },
      providers: defaultProviders,
    });
    expect(screen.getByText('Bezig…')).toBeTruthy();
    // Cleanup — flush the pending request
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne((r) => r.url === '/api/confirm').flush({});
    httpMock.verify();
  });
});
