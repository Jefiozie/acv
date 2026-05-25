import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./subscribe/subscribe.component').then(
        (m) => m.SubscribeComponent
      ),
  },
  {
    path: 'bevestigen',
    loadComponent: () =>
      import('./confirm/confirm.component').then((m) => m.ConfirmComponent),
  },
  {
    path: 'uitschrijven',
    loadComponent: () =>
      import('./unsubscribe/unsubscribe.component').then(
        (m) => m.UnsubscribeComponent
      ),
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('./privacy/privacy.component').then((m) => m.PrivacyComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];

