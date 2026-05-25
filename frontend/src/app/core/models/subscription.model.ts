/**
 * Notification frequency options for the subscription form.
 */
export type Frequency = 'immediate' | 'daily';

/**
 * A Dutch municipality (gemeente) that ACV Groep serves.
 */
export interface Township {
  id: string;
  name: string;
}

/**
 * Payload sent to POST /api/subscribe.
 */
export interface SubscribeRequest {
  email: string;
  townshipId: string;
  frequency: Frequency;
}

/**
 * Hardcoded list of townships where ACV Groep operates.
 * Each entry maps the ACV internal municipality ID to a display name.
 */
export const TOWNSHIPS: readonly Township[] = [{ id: '16', name: 'Ede' }];
// TODO: add more townships when ACV expands — verify IDs at https://www.acv-groep.nl/afval/waardepunt/aanhanger-lenen
