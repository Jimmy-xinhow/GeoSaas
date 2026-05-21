import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Clock, List } from 'lucide-react';
import { getPost, getAllPosts } from '@/content/blog/posts';
import RelatedArticles from './article-client';
import PublicFooter from '@/components/layout/public-footer';
import PublicNavbar from '@/components/layout/public-navbar';
import { extractHeadings, markdownToHtml } from './markdown';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

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
  const staticPost = getPost(params.slug);
  if (staticPost) {
    return {
      title: staticPost.title,
      description: staticPost.description,
      openGraph: {
        title: staticPost.title,
        description: staticPost.description,
        type: 'article',
        publishedTime: staticPost.date,
        authors: ['Geovault'],
        siteName: 'Geovault',
        url: `${SITE_URL}/blog/${params.slug}`,
        images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
      },
      twitter: { card: 'summary_large_image', title: staticPost.title, description: staticPost.description, images: [`${SITE_URL}/opengraph-image`] },
      alternates: { canonical: `${SITE_URL}/blog/${params.slug}` },
    };
  }

  try {
    const res = await fetch(`${API_URL}/api/blog/articles/${encodeURIComponent(params.slug)}`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      const article = unwrapArticlePayload(data);
      if (article) {
        return {
          title: article.title,
          description: article.description?.slice(0, 160),
          openGraph: {
            title: article.title,
            description: article.description?.slice(0, 160),
            type: 'article',
            publishedTime: article.createdAt,
            authors: ['Geovault'],
            siteName: 'Geovault',
            url: `${SITE_URL}/blog/${params.slug}`,
            images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
          },
          twitter: { card: 'summary_large_image', title: article.title, description: article.description?.slice(0, 160), images: [`${SITE_URL}/opengraph-image`] },
          alternates: { canonical: `${SITE_URL}/blog/${params.slug}` },
        };
      }
    }
  } catch {}

  return { title: 'Blog — Geovault' };
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
  const staticPost = getPost(params.slug);

  let resolvedArticle: any = null;
  if (!staticPost) {
    // encodeURIComponent is required: NestJS rejects raw CJK in path segments
    // with 400 "Failed to decode param" because the upstream pipeline expects
    // strict percent-encoding. Without it, the legacy CJK slug → 400 → notFound
    // → user sees the 404 page instead of the redirect.
    let res: Response | null = null;
    try {
      res = await fetch(`${API_URL}/api/blog/articles/${encodeURIComponent(params.slug)}`, {
        next: { revalidate: 3600 },
      });
    } catch {
      // network / DNS failure
    }
    if (!res) notFound();
    if (!res.ok) notFound();
    const data = await res.json().catch(() => null);
    resolvedArticle = unwrapArticlePayload(data);
    if (!resolvedArticle) notFound();
  }

  // 301 legacy slugs to canonical. redirect() throws NEXT_REDIRECT — placed
  // OUTSIDE any try/catch so the exception bubbles to Next's router.
  if (resolvedArticle && resolvedArticle.slug && resolvedArticle.slug !== params.slug) {
    redirect(`/blog/${resolvedArticle.slug}`);
  }

  const post: ResolvedPost = staticPost
    ? {
        slug: params.slug,
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
    description: post.description || post.content.slice(0, 200),
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
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
    about: post.site ? [{ '@type': 'Thing', name: post.site.name, url: post.site.url }] : undefined,
    mentions: post.targetKeywords?.map((name) => ({ '@type': 'Thing', name })),
    keywords: post.targetKeywords?.join(', '),
    identifier: 'GEOVAULT-2026-APAC-PRIME',
  };
  const faqJsonLd = extractFaqJsonLd(post.content);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首頁', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${SITE_URL}/blog/${post.slug}` },
    ],
  };

  const headings = extractHeadings(post.content);
  const html = markdownToHtml(post.content);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {articleJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      )}
      {faqJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

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
              本文分析的網站：<strong>{post.site.name}</strong>（{post.site.url}）
              {post.site.bestScore != null && `— GEO 分數 ${post.site.bestScore}/100`}
            </p>
          </div>
        )}

        <div className="mt-12 p-8 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-2xl text-center border border-white/10">
          <h3 className="text-xl font-bold text-white">想優化你的 AI 能見度？</h3>
          <p className="mt-2 text-gray-400">免費掃描你的網站，了解 AI 友善度分數</p>
          <Link href="/" className="inline-block mt-4 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            免費掃描
          </Link>
        </div>

        <RelatedArticles slug={post.slug} />
      </article>
      <PublicFooter />
    </div>
  );
}
