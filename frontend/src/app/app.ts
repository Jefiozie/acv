import { ChangeDetectionStrategy, Component, signal, computed, inject, DOCUMENT } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent {
  private readonly doc = inject(DOCUMENT);
  private readonly storageKey = 'acv-theme';

  readonly theme = signal<'light' | 'dark'>(this.#loadTheme());

  readonly isDark = computed(() => this.theme() === 'dark');

  toggleTheme(): void {
    const next = this.theme() === 'light' ? 'dark' : 'light';
    this.theme.set(next);
    this.doc.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(this.storageKey, next);
  }

  #loadTheme(): 'light' | 'dark' {
    const stored = localStorage.getItem(this.storageKey) as 'light' | 'dark' | null;
    if (stored === 'light' || stored === 'dark') {
      this.doc.documentElement.setAttribute('data-theme', stored);
      return stored;
    }
    // Follow OS preference (matchMedia unavailable in SSR/test environments)
    const prefersDark = this.doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
    const resolved = prefersDark ? 'dark' : 'light';
    this.doc.documentElement.setAttribute('data-theme', resolved);
    return resolved;
  }
}

