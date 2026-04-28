import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getPost, getAllPosts } from '@/content/blog/posts';
import ArticleClient from './article-client';
import PublicNavbar from '@/components/layout/public-navbar';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

interface Props {
  params: { slug: string };
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
    const res = await fetch(`${API_URL}/api/blog/articles/${params.slug}`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      const article = data?.data || data;
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

// Deploy fingerprint: alias-301-2026-04-28
// (Look for this in the rendered comment block to confirm latest build.)

export default async function BlogPostPage({ params }: Props) {
  const staticPost = getPost(params.slug);

  let resolvedArticle: any = null;
  if (!staticPost) {
    // Fetch outside try/catch so redirect()/notFound() exceptions cannot be
    // accidentally swallowed. Network errors are caught explicitly.
    let res: Response | null = null;
    try {
      res = await fetch(`${API_URL}/api/blog/articles/${params.slug}`, {
        next: { revalidate: 3600 },
      });
    } catch {
      // network / DNS failure
    }
    if (!res) notFound();
    if (!res.ok) notFound();
    const data = await res.json().catch(() => null);
    resolvedArticle = data?.data || data;
    if (!resolvedArticle) notFound();
  }

  // 301 legacy slugs to canonical. redirect() throws NEXT_REDIRECT — placed
  // OUTSIDE any try/catch so the exception bubbles to Next's router.
  if (resolvedArticle && resolvedArticle.slug && resolvedArticle.slug !== params.slug) {
    redirect(`/blog/${resolvedArticle.slug}`);
  }

  let articleJsonLd: any = null;
  let faqJsonLd: any = null;

  if (staticPost) {
    articleJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: staticPost.title,
      description: staticPost.description,
      datePublished: staticPost.date,
      author: { '@type': 'Organization', name: 'Geovault', url: SITE_URL },
      publisher: { '@type': 'Organization', name: 'Geovault', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
      isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
      identifier: 'GEOVAULT-2026-APAC-PRIME',
    };
    faqJsonLd = extractFaqJsonLd(staticPost.content);
  } else {
    try {
      const res = await fetch(`${API_URL}/api/blog/articles/${params.slug}`, { next: { revalidate: 3600 } });
      if (res.ok) {
        const data = await res.json();
        const article = data?.data || data;
        if (article) {
          articleJsonLd = {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: article.title,
            description: article.description,
            datePublished: article.createdAt,
            dateModified: article.updatedAt || article.createdAt,
            author: { '@type': 'Organization', name: 'Geovault', url: SITE_URL },
            publisher: { '@type': 'Organization', name: 'Geovault', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
            isPartOf: { '@type': 'WebSite', name: 'Geovault', url: SITE_URL },
            keywords: article.targetKeywords?.join(', '),
            identifier: 'GEOVAULT-2026-APAC-PRIME',
          };
          if (article.content) faqJsonLd = extractFaqJsonLd(article.content);
        }
      }
    } catch {}
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首頁', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: staticPost?.title || 'Article', item: `${SITE_URL}/blog/${params.slug}` },
    ],
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white" data-build="alias-301-2026-04-28">
      {articleJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      )}
      {faqJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <PublicNavbar />

      <ArticleClient />
    </div>
  );
}
