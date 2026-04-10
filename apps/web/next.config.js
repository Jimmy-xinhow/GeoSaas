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
  async rewrites() {
    // Fallback: if NEXT_PUBLIC_API_URL is not baked in at build time,
    // proxy /api/* requests to the API server so the frontend still works.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.geovault.app';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
});
