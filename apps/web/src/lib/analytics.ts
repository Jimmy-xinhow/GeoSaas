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
    __geovaultAnalyticsInitialized?: string;
    __geovaultLastTrackedPage?: string;
    __geovaultPendingAnalyticsEvents?: Array<{
      name: AnalyticsEventName;
      parameters: Record<string, string | number | boolean | undefined>;
    }>;
  }
}

const MAX_PENDING_EVENTS = 50;

export function ensureAnalyticsStub() {
  window.dataLayer = window.dataLayer || [];
  // Google Tag expects command entries to be `arguments` objects. Pushing a
  // normal Array leaves commands visible in dataLayer but the loader silently
  // ignores them, so no collect request is sent.
  window.gtag =
    window.gtag ||
    function gtag(..._args: unknown[]) {
      window.dataLayer?.push(arguments);
    };
}

export function initializeAnalytics(measurementId: string): boolean {
  if (!measurementId) return false;

  ensureAnalyticsStub();
  if (window.__geovaultAnalyticsInitialized !== measurementId) {
    window.gtag?.('js', new Date());
    window.gtag?.('config', measurementId, {
      send_page_view: false,
      anonymize_ip: true,
    });
    window.__geovaultAnalyticsInitialized = measurementId;
  }

  const pending = window.__geovaultPendingAnalyticsEvents?.splice(0) ?? [];
  for (const event of pending) {
    window.gtag?.('event', event.name, event.parameters);
  }
  return true;
}

export function trackEvent(
  name: AnalyticsEventName,
  parameters: Record<string, string | number | boolean | undefined> = {},
) {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem('geovault_analytics_consent') !== 'granted') return;

  if (window.__geovaultAnalyticsInitialized && window.gtag) {
    window.gtag('event', name, parameters);
    return;
  }

  const pending = window.__geovaultPendingAnalyticsEvents || [];
  pending.push({ name, parameters });
  window.__geovaultPendingAnalyticsEvents = pending.slice(-MAX_PENDING_EVENTS);
}
