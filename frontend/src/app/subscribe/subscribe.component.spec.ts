import { render, screen, fireEvent } from '@testing-library/angular';
import { provideRouter } from '@angular/router';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { SubscribeComponent } from './subscribe.component';
import { SubscriptionService } from '../core/services/subscription.service';

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
    expect(screen.getByText(/Voer een geldig e-mailadres in/i)).toBeInTheDocument();
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('shows township error on submit attempt with no township selected', async () => {
    const { detectChanges } = await setup();
    const emailInput = screen.getByLabelText(/E-mailadres/i);
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } });
    const submitButton = screen.getByRole('button', { name: /Aanmelden/i });
    fireEvent.click(submitButton);
    detectChanges();
    expect(screen.getByText(/Selecteer een gemeente/i)).toBeInTheDocument();
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('shows frequency error on submit attempt with no frequency selected', async () => {
    const { detectChanges } = await setup();
    const emailInput = screen.getByLabelText(/E-mailadres/i);
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } });
    const townshipSelect = screen.getByLabelText(/Gemeente/i);
    fireEvent.change(townshipSelect, { target: { value: '16' } });
    const submitButton = screen.getByRole('button', { name: /Aanmelden/i });
    fireEvent.click(submitButton);
    detectChanges();
    expect(screen.getByText(/Kies een meldingsfrequentie/i)).toBeInTheDocument();
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('calls SubscriptionService.subscribe with correct body on valid submit', async () => {
    const { detectChanges } = await setup();
    const emailInput = screen.getByLabelText(/E-mailadres/i);
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } });
    const townshipSelect = screen.getByLabelText(/Gemeente/i);
    fireEvent.change(townshipSelect, { target: { value: '16' } });
    const radioImmediate = screen.getByLabelText(/Meteen/i);
    fireEvent.click(radioImmediate);
    detectChanges();
    const submitButton = screen.getByRole('button', { name: /Aanmelden/i });
    fireEvent.click(submitButton);
    detectChanges();
    expect(mockSubscribe).toHaveBeenCalledOnce();
    expect(mockSubscribe).toHaveBeenCalledWith({
      email: 'test@example.com',
      townshipId: '16',
      frequency: 'immediate',
    });
  });

  it('shows success state after subscribe observable completes', async () => {
    const { detectChanges } = await setup(() => of(undefined));
    const emailInput = screen.getByLabelText(/E-mailadres/i);
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } });
    const townshipSelect = screen.getByLabelText(/Gemeente/i);
    fireEvent.change(townshipSelect, { target: { value: '16' } });
    const radioImmediate = screen.getByLabelText(/Meteen/i);
    fireEvent.click(radioImmediate);
    detectChanges();
    const submitButton = screen.getByRole('button', { name: /Aanmelden/i });
    fireEvent.click(submitButton);
    detectChanges();
    const statusEl = screen.getByRole('status');
    expect(statusEl.textContent).toContain('Check je inbox');
  });

  it('shows Dutch error message when subscribe observable errors', async () => {
    const { detectChanges } = await setup(() =>
      throwError(() => new Error('API error'))
    );
    const emailInput = screen.getByLabelText(/E-mailadres/i);
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } });
    const townshipSelect = screen.getByLabelText(/Gemeente/i);
    fireEvent.change(townshipSelect, { target: { value: '16' } });
    const radioImmediate = screen.getByLabelText(/Meteen/i);
    fireEvent.click(radioImmediate);
    detectChanges();
    const submitButton = screen.getByRole('button', { name: /Aanmelden/i });
    fireEvent.click(submitButton);
    detectChanges();
    const alertEl = screen.getByRole('alert');
    expect(alertEl.textContent).toContain('Er is iets misgegaan');
    expect(alertEl.textContent).not.toMatch(/\d{3}/); // no HTTP status code
  });

  it('township dropdown contains an option with text "Ede"', async () => {
    await setup();
    const edeOption = screen.getByRole('option', { name: 'Ede' });
    expect(edeOption).toBeInTheDocument();
  });

  it('frequency radios include labels "Meteen" and "Dagelijks overzicht"', async () => {
    await setup();
    expect(screen.getByLabelText(/Meteen/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Dagelijks overzicht/i)).toBeInTheDocument();
  });

  it('renders a routerLink to /privacy in the template', async () => {
    await setup();
    const privacyLink = screen.getByRole('link', { name: /Privacybeleid/i });
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink).toHaveAttribute('href', '/privacy');
  });
});
