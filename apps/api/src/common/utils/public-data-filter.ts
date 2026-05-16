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
