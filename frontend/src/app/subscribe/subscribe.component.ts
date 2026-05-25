import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { form, FormField, email, required } from '@angular/forms/signals';

import {
  Frequency,
  TOWNSHIPS,
  Township,
} from '../core/models/subscription.model';
import { SubscriptionService } from '../core/services/subscription.service';

/** Four-state UI machine for tracking the form submission lifecycle. */
type FormState = 'idle' | 'loading' | 'success' | 'error';

/** Internal model shape used by Signal Forms. */
interface SubscribeFormModel {
  email: string;
  townshipId: string;
  frequency: string;
}

@Component({
  selector: 'app-subscribe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormField],
  templateUrl: './subscribe.component.html',
  styleUrl: './subscribe.component.scss',
})
export class SubscribeComponent {
  // ── Dependencies ──────────────────────────────────────────────────────────
  private readonly destroyRef = inject(DestroyRef);
  private readonly subscriptionService = inject(SubscriptionService);

  // ── Form model and Signal Form ────────────────────────────────────────────
  /** Writable signal backing the Signal Form. */
  private readonly formModel = signal<SubscribeFormModel>({
    email: '',
    townshipId: '',
    frequency: '',
  });

  /**
   * Signal Form with three required fields; email field also validates format.
   * API: form(model, schemaFn) from @angular/forms/signals (experimental 21.0.0)
   */
  readonly subscribeForm = form(this.formModel, (p) => {
    required(p.email);
    email(p.email);
    required(p.townshipId);
    required(p.frequency);
  });

  // ── Field aliases for template readability ────────────────────────────────
  readonly emailField = this.subscribeForm.email;
  readonly townshipIdField = this.subscribeForm.townshipId;
  readonly frequencyField = this.subscribeForm.frequency;

  // ── UI state ──────────────────────────────────────────────────────────────
  readonly state = signal<FormState>('idle');

  // ── Static data ───────────────────────────────────────────────────────────
  readonly townships: readonly Township[] = TOWNSHIPS;

  // ── Event handlers ────────────────────────────────────────────────────────
  /**
   * Handles native form submit.
   * 1. Prevents browser navigation.
   * 2. Marks all fields touched to surface validation errors.
   * 3. Guards against invalid form state.
   * 4. Calls the service and drives the state machine.
   */
  onSubmit(event: Event): void {
    event.preventDefault();

    // Mark every field touched so validation errors become visible.
    this.subscribeForm.email().markAsTouched();
    this.subscribeForm.townshipId().markAsTouched();
    this.subscribeForm.frequency().markAsTouched();

    // Guard: do not submit if the form has validation errors or pending validators.
    if (!this.subscribeForm().valid()) {
      return;
    }

    this.state.set('loading');

    const { email: emailVal, townshipId, frequency } = this.formModel();
    this.subscriptionService
      .subscribe({
        email: emailVal,
        townshipId,
        frequency: frequency as Frequency,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.state.set('success'),
        error: () => this.state.set('error'),
      });
  }
}

