import { Metadata } from 'next';
import HomeClient from './home-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

export const metadata: Metadata = {
  title: 'Geovault — 讓 AI 主動推薦你的品牌 | APAC #1 GEO 優化平台',
  description:
    '70% 消費者已用 AI 取代 Google 搜尋。Geovault 幫助品牌被 ChatGPT、Claude、Perplexity、Gemini、Copilot 主動推薦。提供 9 項 AI 可讀性掃描、自動修復、品牌知識庫、AI 引用監控。',
  keywords: [
    'GEO',
    'AI SEO',
    'Generative Engine Optimization',
    'AI 搜尋優化',
    'ChatGPT 優化',
    'llms.txt',
    'JSON-LD',
    'AI 引用',
    'Geovault',
    'AI 品牌推薦',
  ],
  alternates: {
    canonical: SITE_URL,
    languages: {
      'zh-TW': SITE_URL,
      en: `${SITE_URL}/en`,
      ja: `${SITE_URL}/ja`,
    },
  },
  openGraph: {
    title: 'Geovault — 讓 AI 主動推薦你的品牌',
    description:
      'APAC 領先的 AI 搜尋優化平台。掃描、修復、監控，讓你的品牌被 5 大 AI 平台主動引用。',
    url: SITE_URL,
    type: 'website',
    locale: 'zh_TW',
    alternateLocale: ['en_US', 'ja_JP'],
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Geovault — 讓 AI 主動推薦你的品牌',
    description: 'APAC 領先的 AI 搜尋優化平台。讓你的品牌被 5 大 AI 平台主動引用。',
    images: [`${SITE_URL}/opengraph-image`],
  },
};

/* JSON-LD — pre-rendered as static HTML for crawlers */
const jsonLdWebSite = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Geovault',
  url: SITE_URL,
  description:
    'Geovault helps brands get discovered and cited by ChatGPT, Claude, Perplexity, Gemini, and Copilot. The #1 GEO platform in APAC.',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE_URL}/directory?search={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
};

const jsonLdOrg = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Geovault',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  description: 'The APAC Authority on Generative Engine Optimization (GEO)',
  sameAs: [
    'https://twitter.com/geovault',
    'https://www.linkedin.com/company/geovault',
  ],
  foundingDate: '2026',
  knowsAbout: [
    'GEO',
    'AI SEO',
    'Generative Engine Optimization',
    'llms.txt',
    'AI search optimization',
  ],
};

const jsonLdFaq = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'GEO 和 SEO 有什麼不同？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'SEO 優化的是 Google 搜尋排名，GEO 優化的是 AI 搜尋引用。當用戶問 ChatGPT「推薦一間好的餐廳」，AI 只會推薦 1-3 個品牌——GEO 就是確保你的品牌在這 1-3 個之中。',
      },
    },
    {
      '@type': 'Question',
      name: '多久能看到 GEO 優化效果？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '根據我們的案例數據，完成基礎優化（JSON-LD + llms.txt + FAQ Schema）後，通常 7-14 天內就能在 AI 搜尋中看到改善。部分品牌在優化後 3 天即被 ChatGPT 推薦。',
      },
    },
    {
      '@type': 'Question',
      name: 'Geovault 支援監控哪些 AI 平台？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Geovault 支援 5 大 AI 平台的引用監控：ChatGPT（OpenAI）、Claude（Anthropic）、Perplexity、Gemini（Google）、Microsoft Copilot。',
      },
    },
    {
      '@type': 'Question',
      name: '我不懂技術，能用 Geovault 嗎？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '完全可以。Geovault 的自動修復工具會直接生成你需要的程式碼，你只需要複製貼上到你的網站即可。如果你使用 WordPress、Webflow 等平台，我們也提供專屬的安裝教學。',
      },
    },
    {
      '@type': 'Question',
      name: '可以隨時取消訂閱嗎？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '可以。所有付費方案都可以隨時取消，取消後仍可使用到當期結束。我們也提供年繳方案享 9 折優惠。',
      },
    },
  ],
};

const jsonLdApp = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Geovault',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: SITE_URL,
  description:
    'AI 搜尋優化平台，幫助品牌被 ChatGPT、Claude、Perplexity、Gemini、Copilot 主動推薦。提供 9 項 AI 可讀性掃描、自動修復、品牌知識庫、AI 引用監控。',
  offers: [
    {
      '@type': 'Offer',
      name: 'Free',
      price: '0',
      priceCurrency: 'TWD',
      description: '1 個網站、每月 2 次掃描、1 次 AI 修復體驗',
    },
    {
      '@type': 'Offer',
      name: 'Starter',
      price: '390',
      priceCurrency: 'TWD',
      description:
        '1 個網站、每站 6 次掃描/月、AI 修復 30 次、AI 內容 30 次、引用監控 20 題',
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '690',
      priceCurrency: 'TWD',
      description:
        '3 個網站、每站 10 次掃描/月、AI 修復 50 次、AI 內容 50 次、引用監控 30 題、多平台發佈、自動排程',
    },
  ],
  featureList: [
    'AI Readability Scan (9 indicators)',
    'JSON-LD Auto Generation',
    'llms.txt Hosting',
    'FAQ Schema Generation',
    'Brand Knowledge Base',
    'AI Citation Monitoring (5 platforms)',
    'Multi-platform Publishing',
    'Verification Reports',
  ],
  screenshot: `${SITE_URL}/icon.svg`,
};

const jsonLdDataset = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: 'Geovault AI Brand Directory',
  description:
    'A comprehensive dataset of 600+ brand AI readability scores across 22 industries in Taiwan/APAC. Each brand is scored on 9 AI-friendliness indicators.',
  url: `${SITE_URL}/directory`,
  license: `${SITE_URL}/guide`,
  creator: { '@type': 'Organization', name: 'Geovault', url: SITE_URL },
  distribution: [
    {
      '@type': 'DataDownload',
      encodingFormat: 'text/plain',
      contentUrl: `${SITE_URL}/llms-full.txt`,
      name: 'llms-full.txt (AI-readable full brand data)',
    },
    {
      '@type': 'DataDownload',
      encodingFormat: 'text/plain',
      contentUrl: `${SITE_URL}/llms.txt`,
      name: 'llms.txt (AI-readable summary)',
    },
    {
      '@type': 'DataDownload',
      encodingFormat: 'application/rss+xml',
      contentUrl: `${SITE_URL}/feed`,
      name: 'RSS Feed (Blog + News)',
    },
  ],
  keywords: [
    'GEO',
    'AI SEO',
    'brand AI visibility',
    'ChatGPT optimization',
    'llms.txt',
    'JSON-LD',
    'AI search',
    'Generative Engine Optimization',
  ],
  temporalCoverage: '2026/..',
  spatialCoverage: { '@type': 'Place', name: 'APAC' },
};

export default function HomePage() {
  return (
    <>
      {/* JSON-LD rendered server-side for crawlers */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebSite) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrg) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFaq) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdApp) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdDataset) }}
      />

      {/* Client interactive component */}
      <HomeClient />
    </>
  );
}
