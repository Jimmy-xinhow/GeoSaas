import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Clock, List } from 'lucide-react';
import { getPost, getAllPosts } from '@/content/blog/posts';
import PublicFooter from '@/components/layout/public-footer';
import PublicNavbar from '@/components/layout/public-navbar';
import { buildSeoDescription, extractHeadings, markdownToHtml, markdownToPlainText } from './markdown';
import { decodeUrlPathSegmentOnce, encodeUrlPathSegmentOnce } from '@geovault/shared';
import { serializeJsonLd } from '@/lib/json-ld';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const LEGACY_NOINDEX_TEMPLATE_TYPES = new Set([
  'geo_overview',
  'score_breakdown',
  'competitor_comparison',
  'improvement_tips',
  'industry_benchmark',
  'brand_reputation',
]);

interface Props {
  params: { slug: string };
}

interface ResolvedPost {
  slug: string;
  title: string;
  description?: string;
  category?: string;
  readTime?: string;
  date: string;
  content: string;
  site?: {
    name: string;
    url: string;
    bestScore?: number;
    industry?: string;
  } | null;
  targetKeywords?: string[];
}

interface RelatedArticle {
  slug: string;
  title: string;
  description?: string;
  createdAt: string;
}

function unwrapArticlePayload(payload: any) {
  if (!payload) return null;
  if (Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data || null;
  }
  return payload;
}

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const normalizedSlug = decodeUrlPathSegmentOnce(params.slug);
  const encodedSlug = encodeUrlPathSegmentOnce(params.slug);
  if (!normalizedSlug || !encodedSlug) notFound();

  const staticPost = getPost(normalizedSlug);
  if (staticPost) {
    const seoDescription = buildSeoDescription(staticPost.description, staticPost.content);
    return {
      title: staticPost.title,
      description: seoDescription,
      openGraph: {
        title: staticPost.title,
        description: seoDescription,
        type: 'article',
        publishedTime: staticPost.date,
        authors: ['Geovault'],
        siteName: 'Geovault',
        url: `${SITE_URL}/blog/${encodedSlug}`,
        images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
      },
      twitter: { card: 'summary_large_image', title: staticPost.title, description: seoDescription, images: [`${SITE_URL}/opengraph-image`] },
      alternates: { canonical: `${SITE_URL}/blog/${encodedSlug}` },
    };
  }

  try {
    const res = await fetch(`${API_URL}/api/blog/articles/${encodedSlug}`, { next: { revalidate: 3600 } });
    if (res.status === 404 || res.status === 410) notFound();
    if (res.ok) {
      const data = await res.json();
      const article = unwrapArticlePayload(data);
      if (article) {
        const seoTitle = markdownToPlainText(article.title || '');
        const seoDescription = buildSeoDescription(article.description, article.content || '');
        return {
          title: seoTitle,
          description: seoDescription,
          openGraph: {
            title: seoTitle,
            description: seoDescription,
            type: 'article',
            publishedTime: article.createdAt,
            authors: ['Geovault'],
            siteName: 'Geovault',
            url: `${SITE_URL}/blog/${encodeURIComponent(article.slug)}`,
            images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
          },
          twitter: { card: 'summary_large_image', title: seoTitle, description: seoDescription, images: [`${SITE_URL}/opengraph-image`] },
          alternates: { canonical: `${SITE_URL}/blog/${encodeURIComponent(article.slug)}` },
          robots: LEGACY_NOINDEX_TEMPLATE_TYPES.has(article.templateType)
            ? { index: false, follow: true }
            : { index: true, follow: true },
        };
      }
    }
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'digest' in error &&
      error.digest === 'NEXT_NOT_FOUND'
    ) {
      throw error;
    }
  }

  return { title: 'Blog — Geovault' };
}

async function fetchRelatedArticles(
  currentSlug: string,
  article: any,
): Promise<RelatedArticle[]> {
  const candidates: RelatedArticle[] = [];
  const seen = new Set([currentSlug]);
  const collect = (payload: any) => {
    const list = unwrapArticlePayload(payload)?.items;
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item?.slug || seen.has(item.slug)) continue;
      seen.add(item.slug);
      candidates.push(item as RelatedArticle);
    }
  };
  const fetchList = async (url: string) => {
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (response.ok) collect(await response.json());
  };

  try {
    if (article?.siteId) {
      await fetchList(`${API_URL}/api/blog/articles/site/${encodeURIComponent(article.siteId)}?page=1&limit=8`);
    }
    if (candidates.length < 3 && article?.industrySlug) {
      await fetchList(`${API_URL}/api/blog/articles?page=1&limit=8&industry=${encodeURIComponent(article.industrySlug)}`);
    }
    if (candidates.length < 3) {
      await fetchList(`${API_URL}/api/blog/articles?page=1&limit=8`);
    }
  } catch {
    // Related links are supplementary; the article itself stays available if
    // the list request fails.
  }
  return candidates.slice(0, 3);
}

function extractFaqJsonLd(content: string) {
  const faqs: { question: string; answer: string }[] = [];
  const regex = /\*\*Q:\s*(.+?)\*\*\s*\n\s*\nA:\s*(.+?)(?=\n\n\*\*Q:|\n\n##|\n\n---|\s*$)/gs;
  let match;
  while ((match = regex.exec(content)) !== null) {
    faqs.push({ question: match[1].trim(), answer: match[2].trim() });
  }
  if (faqs.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

// Force per-request rendering. Without this, Next.js's App Router caches
// dynamic page responses keyed by URL — so when an article's slug changed
// during the CJK→ASCII migration, requests to the legacy slug were still
// served pre-migration HTML (no redirect) from cache.
export const dynamic = 'force-dynamic';

export default async function BlogPostPage({ params }: Props) {
  const normalizedSlug = decodeUrlPathSegmentOnce(params.slug);
  const encodedSlug = encodeUrlPathSegmentOnce(params.slug);
  if (!normalizedSlug || !encodedSlug) notFound();

  const staticPost = getPost(normalizedSlug);

  let resolvedArticle: any = null;
  if (!staticPost) {
    // encodeURIComponent is required: NestJS rejects raw CJK in path segments
    // with 400 "Failed to decode param" because the upstream pipeline expects
    // strict percent-encoding. Without it, the legacy CJK slug → 400 → notFound
    // → user sees the 404 page instead of the redirect.
    let res: Response | null = null;
    try {
      res = await fetch(`${API_URL}/api/blog/articles/${encodedSlug}`, {
        next: { revalidate: 3600 },
      });
    } catch (error) {
      // A transient upstream failure must not be presented to crawlers as a
      // permanent 404. Let Next render its error boundary instead.
      throw new Error('Unable to load blog article', { cause: error });
    }
    if (!res) throw new Error('Unable to load blog article');
    if (res.status === 404 || res.status === 410) notFound();
    if (!res.ok) throw new Error(`Blog article API returned ${res.status}`);
    const data = await res.json().catch(() => null);
    resolvedArticle = unwrapArticlePayload(data);
    if (!resolvedArticle) notFound();
  }

  // Permanent legacy-slug redirect. permanentRedirect() throws NEXT_REDIRECT — placed
  // OUTSIDE any try/catch so the exception bubbles to Next's router.
  if (resolvedArticle && resolvedArticle.slug && resolvedArticle.slug !== normalizedSlug) {
    permanentRedirect(`/blog/${encodeURIComponent(resolvedArticle.slug)}`);
  }

  const post: ResolvedPost = staticPost
    ? {
        slug: normalizedSlug,
        title: staticPost.title,
        description: staticPost.description,
        category: staticPost.category,
        readTime: staticPost.readTime,
        date: staticPost.date,
        content: staticPost.content,
        site: null,
        targetKeywords: [],
      }
    : {
        slug: resolvedArticle.slug,
        title: resolvedArticle.title,
        description: resolvedArticle.description,
        category: resolvedArticle.category === 'analysis' ? 'AI 分析報告' : resolvedArticle.category,
        readTime: resolvedArticle.readTime,
        date: resolvedArticle.createdAt,
        content: resolvedArticle.content || '',
        site: resolvedArticle.site,
        targetKeywords: resolvedArticle.targetKeywords || [],
      };

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: buildSeoDescription(post.description, post.content),
    datePublished: post.date,
    dateModified: resolvedArticle?.updatedAt || post.date,
    author: { '@type': 'Organization', name: 'Geovault', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Geovault',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
    },
    isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/blog/${encodeUrlPathSegmentOnce(post.slug)}`,
    about: post.site ? [{ '@type': 'Thing', name: post.site.name, url: post.site.url }] : undefined,
    mentions: post.targetKeywords?.map((name) => ({ '@type': 'Thing', name })),
    keywords: post.targetKeywords?.join(', '),
  };
  const faqJsonLd = extractFaqJsonLd(post.content);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首頁', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${SITE_URL}/blog/${encodeUrlPathSegmentOnce(post.slug)}` },
    ],
  };

  const headings = extractHeadings(post.content);
  const html = markdownToHtml(post.content);
  const relatedArticles = staticPost
    ? getAllPosts()
        .filter((item) => item.slug !== post.slug)
        .slice(0, 3)
        .map((item) => ({ slug: item.slug, title: item.title, description: item.description, createdAt: item.date }))
    : await fetchRelatedArticles(post.slug, resolvedArticle);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {articleJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleJsonLd) }} />
      )}
      {faqJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }} />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />

      <PublicNavbar />

      <nav className="max-w-3xl mx-auto px-6 pt-6" aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-sm text-gray-400">
          <li><Link href="/" className="hover:text-white">首頁</Link></li>
          <li><ChevronRight className="h-3 w-3" /></li>
          <li><Link href="/blog" className="hover:text-white">Blog</Link></li>
          <li><ChevronRight className="h-3 w-3" /></li>
          <li className="text-white truncate max-w-[200px]">{post.title}</li>
        </ol>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-8">
        <Link href="/blog" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-6">
          <ArrowLeft className="h-3.5 w-3.5" />
          返回文章列表
        </Link>

        <div className="flex items-center gap-3 text-sm text-gray-400 mb-4">
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-gray-300">
            {post.category}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {post.readTime}
          </span>
          <span>{new Date(post.date).toLocaleDateString('zh-TW')}</span>
        </div>

        <h1 className="text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">
          {post.title}
        </h1>
        <p className="text-lg text-gray-400 mb-8">{post.description}</p>

        {headings.length > 3 && (
          <nav className="bg-white/5 backdrop-blur-sm rounded-xl p-5 mb-8 border border-white/10" aria-label="目錄">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-white">
              <List className="h-4 w-4" />
              目錄
            </div>
            <ol className="space-y-1.5">
              {headings.map((h) => (
                <li key={h.id} className={h.level === 3 ? 'ml-4' : ''}>
                  <a href={`#${h.id}`} className="text-sm text-blue-400 hover:underline">
                    {h.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <hr className="mb-8 border-white/10" />

        <div
          className="article-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {post.site && (
          <div className="mt-8 p-5 bg-blue-500/10 rounded-xl border border-blue-500/20">
            <p className="text-sm text-blue-300">
              本文分析對象為 <strong>{post.site.name}</strong>（
              <a href={post.site.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-200">
                官方網站
              </a>
              ）。
              {post.site.bestScore != null && `— GEO 分數 ${post.site.bestScore}/100`}
            </p>
          </div>
        )}

        <div className="mt-12 p-8 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-2xl text-center border border-white/10">
          <h3 className="text-xl font-bold text-white">想優化你的 AI 能見度？</h3>
          <p className="mt-2 text-gray-400">免費掃描你的網站，了解 GEO 技術準備度與可修復項目</p>
          <Link href="/" className="inline-block mt-4 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            免費掃描
          </Link>
        </div>

        {relatedArticles.length > 0 ? (
          <section className="mt-12" aria-labelledby="related-articles-heading">
            <h2 id="related-articles-heading" className="mb-4 text-lg font-bold text-white">延伸閱讀</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {relatedArticles.map((article) => (
                <Link
                  key={article.slug}
                  href={`/blog/${encodeUrlPathSegmentOnce(article.slug)}`}
                  className="h-full rounded-lg border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
                >
                  <time className="text-xs text-gray-400" dateTime={article.createdAt}>
                    {new Date(article.createdAt).toLocaleDateString('zh-TW')}
                  </time>
                  <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-white">
                    {markdownToPlainText(article.title)}
                  </h3>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </article>
      <PublicFooter />
    </div>
  );
}
