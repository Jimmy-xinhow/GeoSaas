const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
module.exports = withNextIntl({
  output: 'standalone',
  transpilePackages: ['@geovault/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.geovault.app' },
      { protocol: 'https', hostname: 'www.geovault.app' },
      { protocol: 'https', hostname: 'geovault.app' },
    ],
  },
  async redirects() {
    // Legacy SEO consolidation. Old footer once linked to /api/llms.txt and
    // /api/llms-full.txt (commit b4d2597 removed those links from the UI but
    // Google had already queued the URLs and now retries them, getting 403
    // because the api.geovault.app proxy doesn't expose them at /api/*).
    //
    // 301 these to the canonical root paths so Google consolidates index
    // signals onto the live URLs and stops reporting "blocked by 403".
    return [
      { source: '/api/llms.txt',      destination: '/llms.txt',      permanent: true },
      { source: '/api/llms-full.txt', destination: '/llms-full.txt', permanent: true },
    ];
  },
  // NOTE: previously had `rewrites()` proxying /api/:path* to api.geovault.app.
  // That was vestigial — the frontend always calls api.geovault.app directly
  // via NEXT_PUBLIC_API_URL — and the proxy was returning 403 in production
  // (Cloudflare/Railway edge), polluting Google Search Console with 403s for
  // /api/* URLs Google had crawled from old footers. Dropping the rewrite
  // means /api/* now returns a clean 404 from Next.js for paths we don't
  // explicitly redirect, which is the correct SEO signal.
});
