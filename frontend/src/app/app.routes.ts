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
      import('./confirm/confirm.component').then((m) => m.ConfirmComponent), // TODO: replaced in plan 03-02
  },
  {
    path: 'uitschrijven',
    loadComponent: () =>
      import('./unsubscribe/unsubscribe.component').then(
        (m) => m.UnsubscribeComponent
      ), // TODO: replaced in plan 03-03
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('./privacy/privacy.component').then((m) => m.PrivacyComponent), // TODO: replaced in plan 03-03
  },
  {
    path: '**',
    redirectTo: '',
  },
];

