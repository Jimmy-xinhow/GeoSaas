import { Metadata } from 'next';
import HomeClient from './home-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const HOME_URL = SITE_URL.endsWith('/') ? SITE_URL : `${SITE_URL}/`;

export const metadata: Metadata = {
  title: 'Geovault — AI 搜尋優化平台與代營運服務',
  description:
    'Geovault 提供 AI 可讀性掃描、自動修復、品牌知識庫、AI 引用監控與 GEOvault Managed Service 代營運方案，協助品牌提升 ChatGPT、Claude、Perplexity、Gemini、Copilot 可見度。',
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
    'GEO 代營運',
    'AI 搜尋可見度代營運',
    'GEOvault Managed Service',
  ],
  alternates: {
    canonical: HOME_URL,
  },
  openGraph: {
    title: 'Geovault — AI 搜尋優化平台與代營運服務',
    description:
      '自助 SaaS 工具加上專人代營運服務，協助品牌完成 AI 可見度檢測、問題庫設計、知識庫建置與每月追蹤報告。',
    url: SITE_URL,
    type: 'website',
    locale: 'zh_TW',
    alternateLocale: ['en_US', 'ja_JP'],
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Geovault — AI 搜尋優化平台與代營運服務',
    description: '提供自助 GEO 工具與 GEOvault Managed Service 代營運，協助品牌提升 5 大 AI 平台可見度。',
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
        text: '完成基礎優化（JSON-LD + llms.txt + FAQ Schema）後，成效會受網站內容、平台抓取頻率與品牌資料完整度影響；應以持續監測的實際 AI 提及變化判斷，沒有固定天數保證。',
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
      name: '自助訂閱跟代營運方案有什麼不同？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '自助訂閱提供工具功能，需要客戶自己操作、判斷與修正。代營運方案由專人協助完成檢測、問題庫設計、品牌知識庫建置、優化方向判斷與每月報告解讀。',
      },
    },
    {
      '@type': 'Question',
      name: '代營運是否保證 AI 一定推薦我的品牌？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '不保證每次都被 AI 推薦。代營運目標是透過品牌知識庫、內容訊號與 AI 可讀性優化，提升品牌被 AI 正確理解、提及與推薦的機會。',
      },
    },
    {
      '@type': 'Question',
      name: '未達成效退費怎麼認定？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '必須以雙方事前約定的問題庫、平台範圍、檢測期間與可見度指標作為依據。不以詢問數、成交數、單一 AI 回答或單一關鍵字結果作為退費依據。',
      },
    },
    {
      '@type': 'Question',
      name: '可以隨時取消訂閱嗎？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '可以。所有付費方案都可以隨時取消，取消後仍可使用到當期結束。我們也提供年繳折扣方案。',
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
      price: '690',
      priceCurrency: 'TWD',
      description:
        '1 個網站、每站 6 次掃描/月、AI 修復 30 次、AI 內容 30 次、引用監控 20 題',
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '1090',
      priceCurrency: 'TWD',
      description:
        '3 個網站、每站 10 次掃描/月、AI 修復 50 次、AI 內容 50 次、引用監控 30 題、多平台發佈、自動排程',
    },
    {
      '@type': 'Offer',
      name: 'GEOvault Managed Basic',
      price: '7800',
      priceCurrency: 'TWD',
      description:
        'GEO 入門代營運，包含品牌 AI 可見度初始診斷、50 組核心 AI 搜尋問題設計、每月 30 篇 AI 引用內容文章、品牌基礎定位整理、基礎 GEO 優化執行建議與每月簡版可見度報告。',
    },
    {
      '@type': 'Offer',
      name: 'GEOvault Managed Pro',
      price: '15000',
      priceCurrency: 'TWD',
      description:
        'GEO 完整代營運，包含 100 組 AI 搜尋問題庫、每月 50 篇 AI 引用內容文章、品牌 AI 知識庫建置、GEO 優化代執行、競品 AI 可見度簡析、5 大 AI 平台追蹤、完整月報與每月策略建議。',
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
    'A public directory of brand AI readability scores across Taiwan/APAC. Each brand is scored on 9 AI-friendliness indicators.',
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
