import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-confirm',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './confirm.component.html',
  styleUrl: './confirm.component.scss',
})
export class ConfirmComponent implements OnInit {
  token = input<string>('');
  state = signal<'loading' | 'success' | 'error'>('loading');

  private http = inject(HttpClient);

  ngOnInit(): void {
    if (!this.token()) {
      this.state.set('error');
      return;
    }
    this.http
      .get('/api/confirm', { params: { token: this.token() } })
      .subscribe({
        next: () => this.state.set('success'),
        error: () => this.state.set('error'),
      });
  }
}
