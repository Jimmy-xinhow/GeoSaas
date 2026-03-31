'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, Loader2, List, ChevronRight } from 'lucide-react';
import { getPost } from '@/content/blog/posts';
import { useBlogArticle, useBlogArticles } from '@/hooks/use-blog';
import { useMemo } from 'react';

/** Extract headings for TOC */
function extractHeadings(md: string): { id: string; text: string; level: number }[] {
  const headings: { id: string; text: string; level: number }[] = [];
  const regex = /^(#{2,3})\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(md)) !== null) {
    const text = match[2].trim();
    const id = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/-+$/, '');
    headings.push({ id, text, level: match[1].length });
  }
  return headings;
}

/** Extract FAQ pairs for display */
function extractFaqs(md: string): { question: string; answer: string }[] {
  const faqs: { question: string; answer: string }[] = [];
  const regex = /\*\*Q:\s*(.+?)\*\*\s*\n\s*\n\s*A:\s*(.+?)(?=\n\n\*\*Q:|\n\n##|\n\n---|\n*$)/gs;
  let match;
  while ((match = regex.exec(md)) !== null) {
    faqs.push({ question: match[1].trim(), answer: match[2].trim() });
  }
  return faqs;
}

/** Markdown to HTML with heading IDs */
function markdownToHtml(md: string): string {
  return md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-black/50 text-gray-100 rounded-lg p-4 overflow-x-auto my-4 border border-white/10"><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded text-sm text-gray-200">$1</code>')
    // Tables
    .replace(/\|(.+)\|/gm, (match) => {
      const cells = match.split('|').filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return ''; // separator row
      const isHeader = cells.some((c) => c.includes('---'));
      const tag = isHeader ? 'th' : 'td';
      return `<tr>${cells.map((c) => `<${tag} class="border border-white/10 px-3 py-2 text-sm text-gray-300">${c}</${tag}>`).join('')}</tr>`;
    })
    // Headers with IDs
    .replace(/^### (.+)$/gm, (_, text) => {
      const id = text.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-');
      return `<h3 id="${id}" class="text-lg font-bold text-white mt-8 mb-3">${text}</h3>`;
    })
    .replace(/^## (.+)$/gm, (_, text) => {
      const id = text.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-');
      return `<h2 id="${id}" class="text-xl font-bold text-white mt-10 mb-4">${text}</h2>`;
    })
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Ordered lists
    .replace(/^(\d+)\.\s+(.+)$/gm, '<li class="ml-6 list-decimal text-gray-300">$2</li>')
    // Unordered lists
    .replace(/^-\s+(.+)$/gm, '<li class="ml-6 list-disc text-gray-300">$1</li>')
    // Blockquotes
    .replace(/^>\s+(.+)$/gm, '<blockquote class="border-l-4 border-blue-400 pl-4 py-2 my-4 text-gray-400 italic">$1</blockquote>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-8 border-white/10"/>')
    // Paragraphs (lines that don't start with HTML)
    .replace(/^(?!<[a-z])([\s\S]+?)(?=\n\n|$)/gm, (match) => {
      const trimmed = match.trim();
      if (!trimmed || trimmed.startsWith('<')) return trimmed;
      return `<p class="text-gray-300 leading-relaxed mb-4">${trimmed}</p>`;
    })
    .replace(/<p[^>]*><\/p>/g, '');
}

export default function ArticleClient() {
  const params = useParams();
  const slug = params.slug as string;

  const staticPost = getPost(slug);
  const { data: apiArticle, isLoading } = useBlogArticle(staticPost ? '' : slug);
  const { data: relatedArticles } = useBlogArticles({ page: 1 });

  const post = staticPost
    ? { title: staticPost.title, description: staticPost.description, category: staticPost.category, readTime: staticPost.readTime, date: staticPost.date, content: staticPost.content, site: null, targetKeywords: [] as string[] }
    : apiArticle
    ? { title: apiArticle.title, description: apiArticle.description, category: apiArticle.category === 'analysis' ? 'AI 分析報告' : apiArticle.category, readTime: apiArticle.readTime, date: apiArticle.createdAt, content: apiArticle.content || '', site: apiArticle.site, targetKeywords: [] as string[] }
    : null;

  const headings = useMemo(() => post ? extractHeadings(post.content) : [], [post]);
  const related = useMemo(() => {
    if (!relatedArticles) return [];
    return relatedArticles.items.filter((a) => a.slug !== slug).slice(0, 3);
  }, [relatedArticles, slug]);

  if (isLoading && !staticPost) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold text-white">找不到文章</h2>
        <Link href="/blog" className="text-blue-400 mt-4 inline-block">返回文章列表</Link>
      </div>
    );
  }

  return (
    <>
      {/* Breadcrumb */}
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
        {/* Back link */}
        <Link href="/blog" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-6">
          <ArrowLeft className="h-3.5 w-3.5" />
          返回文章列表
        </Link>

        {/* Meta info */}
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

        {/* Title */}
        <h1 className="text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">
          {post.title}
        </h1>
        <p className="text-lg text-gray-400 mb-8">{post.description}</p>

        {/* Table of Contents */}
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

        {/* Article Body */}
        <div
          className="article-content"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(post.content) }}
        />

        {/* Related site info */}
        {post.site && (
          <div className="mt-8 p-5 bg-blue-500/10 rounded-xl border border-blue-500/20">
            <p className="text-sm text-blue-300">
              本文分析的網站：<strong>{post.site.name}</strong>（{post.site.url}）
              {post.site.bestScore != null && `— GEO 分數 ${post.site.bestScore}/100`}
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 p-8 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-2xl text-center border border-white/10">
          <h3 className="text-xl font-bold text-white">想優化你的 AI 能見度？</h3>
          <p className="mt-2 text-gray-400">免費掃描你的網站，了解 AI 友善度分數</p>
          <Link href="/" className="inline-block mt-4 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            免費掃描
          </Link>
        </div>

        {/* Related Articles */}
        {related.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-bold text-white mb-4">相關文章</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {related.map((a) => (
                <Link key={a.slug} href={`/blog/${a.slug}`}>
                  <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-4 hover:bg-white/10 transition-all h-full">
                    <p className="text-xs text-gray-400 mb-1">
                      {new Date(a.createdAt).toLocaleDateString('zh-TW')}
                    </p>
                    <h3 className="font-semibold text-sm text-white line-clamp-2">{a.title}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </>
  );
}
