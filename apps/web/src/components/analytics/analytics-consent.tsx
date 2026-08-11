'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ensureAnalyticsStub, initializeAnalytics } from '@/lib/analytics';

const STORAGE_KEY = 'geovault_analytics_consent';
const MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
  (process.env.NODE_ENV === 'production' ? 'G-LL81P39R1X' : '');
type Consent = 'pending' | 'granted' | 'denied';

function applyConsent(value: Exclude<Consent, 'pending'>) {
  ensureAnalyticsStub();
  window.gtag?.('consent', 'update', {
    analytics_storage: value,
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
}

export default function AnalyticsConsent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [consent, setConsent] = useState<Consent>('pending');
  const [analyticsReady, setAnalyticsReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    ensureAnalyticsStub();
    window.gtag?.('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      wait_for_update: 500,
    });

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'granted' || saved === 'denied') {
      setConsent(saved);
      applyConsent(saved);
    }
  }, []);

  useEffect(() => {
    if (consent !== 'granted' || !MEASUREMENT_ID) {
      setAnalyticsReady(false);
      return;
    }
    setAnalyticsReady(initializeAnalytics(MEASUREMENT_ID));
  }, [consent]);

  useEffect(() => {
    if (!analyticsReady || consent !== 'granted' || !window.gtag) return;
    const query = searchParams.toString();
    const pagePath = query ? `${pathname}?${query}` : pathname;
    if (window.__geovaultLastTrackedPage === pagePath) return;
    window.__geovaultLastTrackedPage = pagePath;

    window.gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_path: pagePath,
    });

    const blogMatch = pathname.match(/^\/blog\/([^/]+)/);
    const directoryMatch = pathname.match(/^\/directory\/([^/]+)/);
    if (blogMatch) {
      window.gtag('event', 'article_view', { article_slug: blogMatch[1] });
    } else if (
      directoryMatch &&
      directoryMatch[1] !== 'industry' &&
      directoryMatch[1] !== 'industries'
    ) {
      window.gtag('event', 'directory_site_view', {
        directory_site_id: directoryMatch[1],
      });
    }
    if (
      /^\/(?:admin\/)?reports?(?:\/|$)/.test(pathname) ||
      pathname.includes('/client-report')
    ) {
      window.gtag('event', 'report_view', { report_path: pathname });
    }
  }, [analyticsReady, consent, pathname, searchParams]);

  const choose = (value: Exclude<Consent, 'pending'>) => {
    window.localStorage.setItem(STORAGE_KEY, value);
    applyConsent(value);
    if (value === 'denied') {
      window.__geovaultLastTrackedPage = undefined;
    }
    setConsent(value);
    setSettingsOpen(false);
  };

  const showPanel = consent === 'pending' || settingsOpen;

  return (
    <>
      {consent === 'granted' && MEASUREMENT_ID ? (
        <Script
          id="geovault-gtag"
          src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
      ) : null}

      {showPanel ? (
        <section
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-xl border border-white/15 bg-gray-950/95 p-4 text-sm text-gray-200 shadow-2xl backdrop-blur sm:p-5"
          aria-label="分析與隱私設定"
        >
          <p className="font-semibold text-white">協助我們改善 GeoVault</p>
          <p className="mt-1 leading-6 text-gray-400">
            經您同意後，我們才會使用 Google Analytics 4
            了解頁面瀏覽與產品流程。廣告儲存、廣告個人化與跨站追蹤會持續停用；拒絕不影響網站功能，且可隨時變更。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => choose('granted')}
              className="rounded-md bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-400"
            >
              同意分析
            </button>
            <button
              type="button"
              onClick={() => choose('denied')}
              className="rounded-md border border-white/15 px-4 py-2 text-gray-200 hover:bg-white/5"
            >
              僅使用必要功能
            </button>
            <a href="/privacy" className="px-2 py-2 text-blue-300 hover:text-blue-200">
              查看隱私權政策
            </a>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="fixed bottom-3 left-3 z-[90] rounded-md border border-white/15 bg-gray-950/90 px-3 py-2 text-xs text-gray-300 shadow-lg hover:text-white"
        >
          隱私設定
        </button>
      )}
    </>
  );
}
