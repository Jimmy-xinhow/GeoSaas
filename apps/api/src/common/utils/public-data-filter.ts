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
  'brand_showcase',
  'client_daily',
  'industry_top10',
  'buyer_guide',
  'industry_current_state',
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

export function isLikelyEditorialDirectoryName(name?: string | null): boolean {
  const text = (name || '').trim();
  if (!text) return false;

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
  if (supportCount < 1) issues.push('missing-supporting-content');
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
                NOT: siteExclusions,
              },
            },
          },
        ],
      },
    ],
  };
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
