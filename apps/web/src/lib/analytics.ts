'use client';

export type AnalyticsEventName =
  | 'article_view'
  | 'directory_site_view'
  | 'scan_start'
  | 'scan_complete'
  | 'report_view'
  | 'sign_up';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(
  name: AnalyticsEventName,
  parameters: Record<string, string | number | boolean | undefined> = {},
) {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem('geovault_analytics_consent') !== 'granted') return;
  window.gtag?.('event', name, parameters);
}
