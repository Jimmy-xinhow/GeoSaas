const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const nextConfig = require('../next.config.js');

test('active industry intelligence routes are not shadowed by redirects', async () => {
  const redirects = await nextConfig.redirects();

  assert.equal(
    redirects.some((rule) => rule.source === '/industry/:industry/:siteId'),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(__dirname, '../src/app/industry/[industry]/compare/page.tsx')),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(__dirname, '../src/app/industry/[industry]/[siteId]/page.tsx')),
    true,
  );
});

test('known legacy machine-readable URLs retain their canonical redirects', async () => {
  const redirects = await nextConfig.redirects();
  const bySource = new Map(redirects.map((rule) => [rule.source, rule]));

  assert.deepEqual(bySource.get('/api/llms.txt'), {
    source: '/api/llms.txt',
    destination: '/llms.txt',
    permanent: true,
  });
  assert.deepEqual(bySource.get('/api/llms-full.txt'), {
    source: '/api/llms-full.txt',
    destination: '/llms-full.txt',
    permanent: true,
  });
});

test('crawler-facing metadata only references the implemented Open Graph image route', () => {
  const metadataFiles = [
    '../src/app/guide/page.tsx',
    '../src/app/directory/industry/[industry]/page.tsx',
  ];

  for (const relativeFile of metadataFiles) {
    const source = fs.readFileSync(path.join(__dirname, relativeFile), 'utf8');
    assert.equal(source.includes('/og-image.png'), false, relativeFile);
    assert.equal(source.includes('/opengraph-image'), true, relativeFile);
  }
});

test('directory visibility changes are never served from a stale public cache', () => {
  const pageSource = fs.readFileSync(
    path.join(__dirname, '../src/app/directory/[siteId]/page.tsx'),
    'utf8',
  );
  const middlewareSource = fs.readFileSync(
    path.join(__dirname, '../src/middleware.ts'),
    'utf8',
  );

  assert.match(pageSource, /cache:\s*'no-store'/);
  assert.doesNotMatch(pageSource, /revalidate:\s*3600/);
  assert.match(middlewareSource, /getMissingPublicDirectoryResponse/);
  assert.match(middlewareSource, /\/api\/directory\/\$\{encodedSiteId\}/);
  assert.match(middlewareSource, /res\.status === 404 \? publicNotFoundResponse\(\) : null/);
});

test('retired blog articles return a crawler-visible 410 from middleware', () => {
  const middlewareSource = fs.readFileSync(
    path.join(__dirname, '../src/middleware.ts'),
    'utf8',
  );
  const blogBoundary = middlewareSource.slice(
    middlewareSource.indexOf('async function getMissingPublicBlogResponse'),
    middlewareSource.indexOf('async function getMissingPublicDirectoryResponse'),
  );

  assert.match(blogBoundary, /res\.status === 410/);
  assert.match(blogBoundary, /publicGoneResponse\(\)/);
  assert.match(middlewareSource, /status:\s*410/);
  assert.match(middlewareSource, /X-Robots-Tag': 'noindex, follow'/);
});

test('legacy blog aliases redirect before Next.js starts streaming HTML', () => {
  const middlewareSource = fs.readFileSync(
    path.join(__dirname, '../src/middleware.ts'),
    'utf8',
  );
  const blogBoundary = middlewareSource.slice(
    middlewareSource.indexOf('async function getMissingPublicBlogResponse'),
    middlewareSource.indexOf('async function getMissingPublicDirectoryResponse'),
  );

  assert.match(blogBoundary, /const article = payload\?\.data \?\? payload/);
  assert.match(blogBoundary, /article\.slug !== decodedSlug/);
  assert.match(blogBoundary, /NextResponse\.redirect\(canonicalUrl, 308\)/);
  assert.match(middlewareSource, /getMissingPublicBlogResponse\(request\)/);
});
