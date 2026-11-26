import type { AnalyticsEventName } from './analytics-core';

/**
 * What the public pages send, in words, for the privacy policy.
 *
 * The policy renders these lists, and analytics-fields.test.ts builds real
 * events with the sender and fails if one carries a field that is not listed
 * here. So the published list cannot fall behind the code.
 *
 * Kept apart from the sender so the policy page can import it without pulling
 * the sending code into the build.
 */

export const ANALYTICS_EVENTS: ReadonlyArray<{ name: AnalyticsEventName; description: string }> = [
  { name: '$pageview', description: 'A page was opened.' },
  {
    name: 'open_app_click',
    description: 'A link into the app (the connect page or the dashboard) was followed.',
  },
  { name: 'github_click', description: 'A link to our GitHub repository was followed.' },
  {
    name: 'install_click',
    description: 'A link to the installation or self-hosting guide was followed.',
  },
];

export interface AnalyticsFieldGroup {
  label: string;
  description: string;
  /** The field names in the event, top level or in its properties. */
  keys: readonly string[];
}

export const ANALYTICS_FIELDS: readonly AnalyticsFieldGroup[] = [
  {
    label: 'What happened',
    description: 'One of the events above.',
    keys: ['event'],
  },
  {
    label: 'Page address',
    description: 'The address of the page, without its query string or anything after a #.',
    keys: ['$current_url', '$host', '$pathname'],
  },
  {
    label: 'Link address',
    description: 'For a followed link, the address it points to, without its query string.',
    keys: ['href'],
  },
  {
    label: 'Where you came from',
    description:
      'On the first page of a visit, the domain of the site that linked you here, such as www.google.com. Never the full address.',
    keys: ['$referrer', '$referring_domain'],
  },
  {
    label: 'Visit ID',
    description:
      'A random number made in your browser’s memory when you open a page. It is never stored, and it is gone when you reload, close the tab, or stay idle for 30 minutes.',
    keys: ['distinct_id', '$session_id'],
  },
  {
    label: 'Time',
    description: 'When it happened.',
    keys: ['timestamp'],
  },
  {
    label: 'Instructions to PostHog',
    description:
      'Which of our projects the event is for, that no profile is to be built, that no location is to be looked up, and the name of the code that sent it.',
    keys: ['api_key', '$process_person_profile', '$geoip_disable', '$lib'],
  },
];
