import { render, screen, fireEvent } from '@testing-library/angular';
import { provideRouter } from '@angular/router';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { SubscribeComponent } from './subscribe.component';
import { SubscriptionService } from '../core/services/subscription.service';

/** Helper: fill the form and fire a native submit on the <form> element. */
async function fillAndSubmit(
  container: Element,
  detectChanges: () => void,
  opts: { email?: string; township?: string; frequency?: string } = {}
) {
  if (opts.email !== undefined) {
    const emailInput = screen.getByLabelText(/E-mailadres/i);
    fireEvent.input(emailInput, { target: { value: opts.email } });
    fireEvent.blur(emailInput);
    detectChanges();
  }
  if (opts.township !== undefined) {
    const townshipSelect = screen.getByLabelText(/Gemeente/i);
    // Signal Forms listens to 'input' event (not 'change') for all native elements.
    // Must set .value before dispatching so Signal Forms reads the correct value.
    (townshipSelect as HTMLSelectElement).value = opts.township;
    fireEvent.input(townshipSelect);
    detectChanges();
  }
  if (opts.frequency !== undefined) {
    const labelText = opts.frequency === 'immediate' ? /Meteen/i : /Dagelijks overzicht/i;
    const radio = screen.getByLabelText(labelText) as HTMLInputElement;
    // Signal Forms listens to 'input' event; reads element.value (not checked).
    (radio as HTMLInputElement).checked = true;
    fireEvent.input(radio);
    detectChanges();
  }
  // Flush any pending microtasks from Signal Forms async debounceSync()
  await Promise.resolve();
  // Fire submit on the <form> element directly — more reliable than clicking button in jsdom.
  const formEl = container.querySelector('form');
  if (formEl) {
    fireEvent.submit(formEl);
    detectChanges();
  }
}

describe('SubscribeComponent', () => {
  const mockSubscribe = vi.fn();

  const setup = async (subscribeImpl?: () => ReturnType<typeof of>) => {
    if (subscribeImpl) {
      mockSubscribe.mockImplementation(subscribeImpl);
    } else {
      mockSubscribe.mockReturnValue(of(undefined));
    }
    return render(SubscribeComponent, {
      providers: [
        provideRouter([]),
        provideHttpClientTesting(),
        {
          provide: SubscriptionService,
          useValue: { subscribe: mockSubscribe },
        },
      ],
    });
  };

  beforeEach(() => {
    mockSubscribe.mockReset();
    mockSubscribe.mockReturnValue(of(undefined));
  });

  it('shows email error on blur with invalid email and does not call API', async () => {
    await setup();
    const emailInput = screen.getByLabelText(/E-mailadres/i);
    fireEvent.input(emailInput, { target: { value: 'not-a-valid-email' } });
    fireEvent.blur(emailInput);
    // getByText throws if element not found — passing means it exists in DOM
    const errorEl = screen.getByText(/Voer een geldig e-mailadres in/i);
    expect(errorEl).toBeTruthy();
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('shows township error on submit attempt with no township selected', async () => {
    const { container, detectChanges } = await setup();
    await fillAndSubmit(container, detectChanges, { email: 'test@example.com' });
    const errorEl = screen.getByText(/Selecteer een gemeente/i);
    expect(errorEl).toBeTruthy();
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('shows frequency error on submit attempt with no frequency selected', async () => {
    const { container, detectChanges } = await setup();
    await fillAndSubmit(container, detectChanges, {
      email: 'test@example.com',
      township: '16',
    });
    const errorEl = screen.getByText(/Kies een meldingsfrequentie/i);
    expect(errorEl).toBeTruthy();
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('calls SubscriptionService.subscribe with correct body on valid submit', async () => {
    const { container, detectChanges } = await setup();
    await fillAndSubmit(container, detectChanges, {
      email: 'test@example.com',
      township: '16',
      frequency: 'immediate',
    });
    expect(mockSubscribe).toHaveBeenCalledOnce();
    expect(mockSubscribe).toHaveBeenCalledWith({
      email: 'test@example.com',
      townshipId: '16',
      frequency: 'immediate',
    });
  });

  it('shows success state after subscribe observable completes', async () => {
    const { container, detectChanges } = await setup(() => of(undefined));
    await fillAndSubmit(container, detectChanges, {
      email: 'test@example.com',
      township: '16',
      frequency: 'immediate',
    });
    const statusEl = screen.getByRole('status');
    expect(statusEl.textContent).toContain('Check je inbox');
  });

  it('shows Dutch error message when subscribe observable errors', async () => {
    const { container, detectChanges } = await setup(() =>
      throwError(() => new Error('API error'))
    );
    await fillAndSubmit(container, detectChanges, {
      email: 'test@example.com',
      township: '16',
      frequency: 'immediate',
    });
    const alertEl = screen.getByRole('alert');
    expect(alertEl.textContent).toContain('Er is iets misgegaan');
    expect(alertEl.textContent).not.toMatch(/\d{3}/); // no HTTP status code
  });

  it('township dropdown contains all townships', async () => {
    await setup();
    const expectedTownships = ['Ede', 'Renkum', 'Renswoude', 'Scherpenzeel', 'Veenendaal', 'Wageningen'];
    for (const name of expectedTownships) {
      expect(screen.getByRole('option', { name })).toBeTruthy();
    }
  });

  it('frequency radios include labels "Meteen" and "Dagelijks overzicht"', async () => {
    await setup();
    expect(screen.getByLabelText(/Meteen/i)).toBeTruthy();
    expect(screen.getByLabelText(/Dagelijks overzicht/i)).toBeTruthy();
  });

  it('renders a routerLink to /privacy in the template', async () => {
    await setup();
    const privacyLink = screen.getByRole('link', { name: /Privacybeleid/i });
    expect(privacyLink).toBeTruthy();
    // RouterLink renders href as the route path
    expect(privacyLink.getAttribute('href')).toBe('/privacy');
  });
});
