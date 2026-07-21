const siteExclusions = [
  { url: { contains: 'example.com', mode: 'insensitive' } },
  { url: { contains: 'example.org', mode: 'insensitive' } },
  { url: { contains: 'localhost', mode: 'insensitive' } },
  { url: { contains: '127.0.0.1', mode: 'insensitive' } },
  { name: { contains: 'Codex QA', mode: 'insensitive' } },
  { name: { contains: 'QA Site', mode: 'insensitive' } },
];

const articleExclusions = [
  { title: { contains: 'Codex QA', mode: 'insensitive' } },
  { description: { contains: 'Codex QA', mode: 'insensitive' } },
  { slug: { contains: 'codex-qa', mode: 'insensitive' } },
];

const indexableBlogTemplateTypes = [
  // Citation-first replacements. These must stay indexable or the safe legacy
  // migration would redirect old URLs into pages omitted from sitemap/listing.
  'brand_profile',
  'faq_deepdive',
  'brand_showcase',
  'client_daily',
  'industry_top10',
  'buyer_guide',
  'industry_current_state',
  // Conservative GEO analysis templates: these are brand/site-specific pages
  // with durable crawl value. Keep experimental or thin operational templates
  // out of sitemap/blog indexes so SEO crawl budget is not flooded.
  'geo_overview',
  'score_breakdown',
  'competitor_comparison',
  'improvement_tips',
  'industry_benchmark',
  'brand_reputation',
];

type DirectorySeoSite = {
  name?: string | null;
  url?: string | null;
  industry?: string | null;
  bestScore?: number | null;
  bestScoreAt?: Date | string | null;
  profile?: unknown;
  latestScanCompletedAt?: Date | string | null;
  qasCount?: number | null;
  blogArticlesCount?: number | null;
  coreGeoFailuresCount?: number | null;
};

type PublicBlogSeoArticle = {
  title?: string | null;
  description?: string | null;
  slug?: string | null;
  templateType?: string | null;
  site?: { name?: string | null; url?: string | null } | null;
};

type PublicSuccessCase = {
  title?: string | null;
  queryUsed?: string | null;
  aiResponse?: string | null;
  site?: { name?: string | null; url?: string | null; isPublic?: boolean | null } | null;
};

function getProfileDescription(profile: unknown): string {
  if (!profile || typeof profile !== 'object') return '';
  const data = profile as Record<string, unknown>;
  const value =
    data.description ??
    data.summary ??
    data.brandDescription ??
    data.about ??
    '';
  return typeof value === 'string' ? value.trim() : String(value || '').trim();
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

export function normalizePublicSiteName(name?: string | null): string {
  const original = (name || '').replace(/\s+/g, ' ').trim();
  if (!original) return '';

  let text = original.replace(/^【(.+)】$/, '$1').trim();
  const ellipsisIndex = Math.min(
    ...[text.indexOf('...'), text.indexOf('…')].filter((index) => index >= 0),
  );
  if (Number.isFinite(ellipsisIndex)) {
    text = text.slice(0, ellipsisIndex).trim();
  }

  const categoryPrefix = text.match(/^([^:：｜|－-]{2,8})[:：]\s*(.{3,})$/);
  if (categoryPrefix && /^(花藝設計|室內設計|裝潢設計|美髮設計|婚攝|眼鏡)$/.test(categoryPrefix[1])) {
    text = categoryPrefix[2].trim();
  }

  const separators = ['｜', '|', '－', '-', ':', '：', '，', '、'];
  const promoWords = /推薦|首選|排名|排行|清單|精選|主頁|服務範圍|課程|優惠|免費|最優質|人氣|專業|一對一|訂房|自由行|機票/;
  for (const separator of separators) {
    const index = text.indexOf(separator);
    if (index <= 1) continue;
    const prefix = text.slice(0, index).trim();
    const suffix = text.slice(index + separator.length).trim();
    if (prefix.length >= 2 && suffix.length >= 2 && promoWords.test(suffix)) {
      text = prefix;
      break;
    }
  }

  text = text.replace(/\s+/g, ' ').replace(/[，、:：｜|－-]+$/g, '').trim();
  return text || original;
}

export function isLikelyEditorialDirectoryName(name?: string | null): boolean {
  const text = (name || '').trim();
  if (!text) return false;

  const obviousScrapedTitle =
    /\.\.\.|(?:\d+\s*(?:\u5927|\u9593|\u5bb6|\u500b|\u9805))|\u4e00\u6b21\u641e\u61c2|\u7cbe\u9078|\u4e3b\u9801|\u670d\u52d9\u7bc4\u570d|\u7b2c\s*\d+\s*\u9801/i.test(text);
  const obviousSearchTitle =
    /(?:\u63a8\u85a6|\u9996\u9078|\u6392\u540d|\u6392\u884c|\u6e05\u55ae).*(?:\u63a8\u85a6|\u9996\u9078|\u6392\u540d|\u6392\u884c|\u6e05\u55ae)|(?:\u63a8\u85a6|\u9996\u9078|\u6392\u540d|\u6392\u884c|\u6e05\u55ae).*(?:\u53f0\u5317|\u65b0\u5317|\u53f0\u4e2d|\u9ad8\u96c4|\u7db2\u53cb|\u514d\u8cbb)/i.test(text);

  if (text.length >= 18 && (obviousScrapedTitle || obviousSearchTitle)) {
    return true;
  }

  const cleanStartsLikeListArticle =
    /^(?:【?20\d{2}|TOP\s?\d+|\d+\s*(?:大|間|家)|.*(?:推薦|排名|排行|清單|懶人包))/i.test(text);
  const cleanHasQuestionTitle = /[?？]/.test(text) && text.length >= 18;
  const cleanHasExplicitEditorialPhrase =
    /(懶人包|總整理|全攻略|完整攻略|一次了解|哪間|必看|PTT|Dcard|網友都推|推薦清單)/i.test(text);
  const cleanHasEditorialBrackets =
    /[【】「」《》]/.test(text) && /(20\d{2}|TOP|推薦|排行|排名|清單|攻略|懶人包)/i.test(text);
  const cleanSoftSignals = countMatches(text, [
    /推薦/i,
    /清單/i,
    /排行/i,
    /排名/i,
    /攻略/i,
    /懶人包/i,
    /總整理/i,
    /教學/i,
    /哪間/i,
    /必看/i,
  ]);

  if (
    cleanStartsLikeListArticle ||
    cleanHasQuestionTitle ||
    cleanHasExplicitEditorialPhrase ||
    cleanHasEditorialBrackets ||
    (text.length >= 28 && cleanSoftSignals >= 2)
  ) {
    return true;
  }

  const startsLikeListArticle =
    /^(?:【)?(?:20\d{2}|TOP\s?\d+|\d+\s*(?:間|家|大|個|位)|[一二三四五六七八九十]+大)/i.test(text);
  const hasQuestionTitle = /[?？]/.test(text) && text.length >= 18;
  const hasExplicitEditorialPhrase =
    /(懶人包|總整理|一次看|盤點|全攻略|攻略集|推薦清單|排名清單|完整.*指南|這一篇|必看|費用.*評價|價錢.*服務)/i.test(text);
  const hasEditorialBrackets = /[【】《》]/.test(text) && /(20\d{2}|TOP|推薦|攻略|清單|評價)/i.test(text);
  const softSignals = countMatches(text, [
    /推薦/i,
    /精選/i,
    /人氣/i,
    /最新/i,
    /比較/i,
    /挑選/i,
    /費用/i,
    /評價/i,
    /清單/i,
    /完整/i,
  ]);

  return (
    startsLikeListArticle ||
    hasQuestionTitle ||
    hasExplicitEditorialPhrase ||
    hasEditorialBrackets ||
    (text.length >= 28 && softSignals >= 2)
  );
}

export function publicSiteWhere(where: Record<string, unknown> = {}) {
  return {
    AND: [
      where,
      {
        NOT: siteExclusions,
      },
    ],
  };
}

export function unsafePublicSiteWhere(where: Record<string, unknown> = {}) {
  return {
    AND: [
      where,
      {
        OR: siteExclusions,
      },
    ],
  };
}

export function publicBlogArticleWhere(where: Record<string, unknown> = {}) {
  return {
    AND: [
      where,
      {
        NOT: articleExclusions,
      },
      {
        OR: [
          { siteId: null },
          {
            site: {
              is: {
                NOT: siteExclusions,
              },
            },
          },
        ],
      },
    ],
  };
}

export function publicIndexableBlogArticleWhere(where: Record<string, unknown> = {}) {
  return {
    AND: [
      publicBlogArticleWhere(where),
      { templateType: { in: indexableBlogTemplateTypes } },
      {
        OR: [
          { siteId: null },
          { site: { is: { isPublic: true } } },
        ],
      },
    ],
  };
}

export function getPublicBlogArticleSeoIssues(article: PublicBlogSeoArticle): string[] {
  const issues: string[] = [];
  if (!isPublicSafeArticle(article)) issues.push('unsafe-test-article');
  if (!article.title || article.title.trim().length < 10) issues.push('short-title');
  if (!article.description || article.description.trim().length < 80) issues.push('thin-description');
  if (isLikelyEditorialDirectoryName(article.site?.name)) issues.push('editorial-site-name');
  return issues;
}

export function isIndexablePublicBlogArticle(article: PublicBlogSeoArticle): boolean {
  return getPublicBlogArticleSeoIssues(article).length === 0;
}

export function getDirectorySiteSeoIssues(site: DirectorySeoSite): string[] {
  const issues: string[] = [];
  const description = getProfileDescription(site.profile);
  const supportCount = (site.qasCount || 0) + (site.blogArticlesCount || 0);

  if (!isPublicSafeSite(site)) issues.push('unsafe-test-site');
  if (!site.bestScore || site.bestScore < 60) issues.push('low-score');
  if (!site.industry) issues.push('missing-industry');
  if (!site.bestScoreAt) issues.push('missing-score-date');
  if (!site.latestScanCompletedAt) issues.push('missing-completed-scan');
  if (description.length < 40) issues.push('thin-description');
  if ((site.qasCount || 0) < 2) issues.push('weak-knowledge');
  if (supportCount < 1) issues.push('missing-supporting-content');
  if ((site.coreGeoFailuresCount || 0) >= 2) issues.push('core-geo-failures');
  if (isLikelyEditorialDirectoryName(site.name)) issues.push('editorial-title-name');

  return issues;
}

export function isIndexableDirectorySite(site: DirectorySeoSite): boolean {
  return getDirectorySiteSeoIssues(site).length === 0;
}

export function unsafePublicBlogArticleWhere(where: Record<string, unknown> = {}) {
  return {
    AND: [
      where,
      {
        OR: [
          ...articleExclusions,
          {
            site: {
              is: {
                OR: siteExclusions,
              },
            },
          },
        ],
      },
    ],
  };
}

export function publicSuccessCaseWhere(where: Record<string, unknown> = {}) {
  return {
    AND: [
      where,
      {
        NOT: [
          { title: { contains: 'Codex QA', mode: 'insensitive' } },
          { title: { contains: 'Admin E2E', mode: 'insensitive' } },
          { title: { contains: 'E2E 成功案例', mode: 'insensitive' } },
          { queryUsed: { contains: 'Codex QA', mode: 'insensitive' } },
          { queryUsed: { contains: '測試', mode: 'insensitive' } },
          { aiResponse: { contains: 'Codex QA', mode: 'insensitive' } },
        ],
      },
      {
        OR: [
          { siteId: null },
          {
            site: {
              is: {
                AND: [
                  { isPublic: true },
                  { NOT: siteExclusions },
                ],
              },
            },
          },
        ],
      },
    ],
  };
}

export function getPublicSuccessCaseSeoIssues(item: PublicSuccessCase): string[] {
  const issues: string[] = [];
  const text = `${item.title || ''}\n${item.queryUsed || ''}\n${item.aiResponse || ''}`;

  if (!item.title || item.title.trim().length < 10) issues.push('short-title');
  if (!item.queryUsed || item.queryUsed.trim().length < 8) issues.push('short-query');
  if (!item.aiResponse || item.aiResponse.trim().length < 80) issues.push('thin-ai-response');
  if (/Codex QA|Admin E2E|E2E|皜祈岫|example\.com|localhost/i.test(text)) issues.push('test-content');
  if (!isPublicSafeSite(item.site)) issues.push('unsafe-test-site');
  if (item.site && item.site.isPublic === false) issues.push('non-public-site');

  return issues;
}

export function isIndexablePublicSuccessCase(item: PublicSuccessCase): boolean {
  return getPublicSuccessCaseSeoIssues(item).length === 0;
}

export function unsafePublicSuccessCaseWhere(where: Record<string, unknown> = {}) {
  return {
    AND: [
      where,
      {
        OR: [
          { title: { contains: 'Codex QA', mode: 'insensitive' } },
          { title: { contains: 'Admin E2E', mode: 'insensitive' } },
          { title: { contains: 'E2E 成功案例', mode: 'insensitive' } },
          { queryUsed: { contains: 'Codex QA', mode: 'insensitive' } },
          { queryUsed: { contains: '測試', mode: 'insensitive' } },
          { aiResponse: { contains: 'Codex QA', mode: 'insensitive' } },
          {
            site: {
              is: {
                OR: siteExclusions,
              },
            },
          },
        ],
      },
    ],
  };
}

export function isPublicSafeSite(site?: { name?: string | null; url?: string | null } | null): boolean {
  if (!site) return true;
  const name = (site.name || '').toLowerCase();
  const url = (site.url || '').toLowerCase();
  return !(
    name.includes('codex qa') ||
    name.includes('qa site') ||
    url.includes('example.com') ||
    url.includes('example.org') ||
    url.includes('localhost') ||
    url.includes('127.0.0.1')
  );
}

export function isPublicSafeArticle(article?: {
  title?: string | null;
  description?: string | null;
  slug?: string | null;
  site?: { name?: string | null; url?: string | null } | null;
} | null): boolean {
  if (!article) return false;
  const text = `${article.title || ''} ${article.description || ''} ${article.slug || ''}`.toLowerCase();
  return !text.includes('codex qa') && !text.includes('codex-qa') && isPublicSafeSite(article.site);
}
