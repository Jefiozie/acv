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
  selector: 'app-unsubscribe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './unsubscribe.component.html',
  styleUrl: './unsubscribe.component.scss',
})
export class UnsubscribeComponent implements OnInit {
  token = input<string>('');
  state = signal<'loading' | 'success' | 'error'>('loading');

  private http = inject(HttpClient);

  ngOnInit(): void {
    if (!this.token()) {
      this.state.set('error');
      return;
    }
    this.http
      .get('/api/unsubscribe', { params: { token: this.token() } })
      .subscribe({
        next: () => this.state.set('success'),
        error: () => this.state.set('error'),
      });
  }
}
