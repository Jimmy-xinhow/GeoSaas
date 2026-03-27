'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, Loader2 } from 'lucide-react';
import { getPost } from '@/content/blog/posts';
import { useBlogArticle } from '@/hooks/use-blog';

/** Simple markdown to HTML converter */
function markdownToHtml(md: string): string {
  return md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split('|').filter(Boolean).map((c) => c.trim());
      return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    })
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hluopt])/gm, '')
    .replace(/^(.+)$/gm, (line) => (line.startsWith('<') ? line : `<p>${line}</p>`))
    .replace(/<p><\/p>/g, '')
    .replace(/<p>\s*<\/p>/g, '');
}

function ArticleContent({
  title,
  description,
  category,
  readTime,
  date,
  content,
}: {
  title: string;
  description: string;
  category: string;
  readTime: string;
  date: string;
  content: string;
}) {
  return (
    <article className="max-w-3xl mx-auto px-6 py-12">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回文章列表
      </Link>

      <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          {category}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {readTime}
        </span>
        <span>{new Date(date).toLocaleDateString('zh-TW')}</span>
      </div>

      <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
        {title}
      </h1>
      <p className="text-lg text-gray-600 mb-8">{description}</p>
      <hr className="mb-8" />

      <div
        className="prose prose-gray prose-lg max-w-none
          prose-headings:text-gray-900 prose-headings:font-bold
          prose-p:text-gray-700 prose-p:leading-relaxed
          prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
          prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
          prose-pre:bg-gray-900 prose-pre:text-gray-100
          prose-table:border prose-th:bg-gray-50 prose-th:p-3 prose-td:p-3"
        dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }}
      />

      <div className="mt-12 p-8 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl text-center">
        <h3 className="text-xl font-bold text-gray-900">
          想優化你的 AI 能見度？
        </h3>
        <p className="mt-2 text-gray-600">
          免費掃描你的網站，了解 AI 友善度分數
        </p>
        <Link
          href="/"
          className="inline-block mt-4 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          免費掃描
        </Link>
      </div>
    </article>
  );
}

export default function BlogPostPage() {
  const params = useParams();
  const slug = params.slug as string;

  // Try static post first
  const staticPost = getPost(slug);

  // If not static, fetch from API
  const { data: apiArticle, isLoading } = useBlogArticle(staticPost ? '' : slug);

  const post = staticPost
    ? {
        title: staticPost.title,
        description: staticPost.description,
        category: staticPost.category,
        readTime: staticPost.readTime,
        date: staticPost.date,
        content: staticPost.content,
      }
    : apiArticle
    ? {
        title: apiArticle.title,
        description: apiArticle.description,
        category: apiArticle.category === 'analysis' ? 'AI 分析報告' : apiArticle.category,
        readTime: apiArticle.readTime,
        date: apiArticle.createdAt,
        content: apiArticle.content || '',
      }
    : null;

  return (
    <div className="min-h-screen bg-white">
      <nav className="flex items-center justify-between p-4 px-6 lg:px-12 bg-white border-b border-gray-100 sticky top-0 z-50">
        <Link href="/" className="text-xl font-bold text-gray-900">
          Geovault
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/blog" className="text-sm text-gray-600 hover:text-gray-900">
            Blog
          </Link>
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">
            登入
          </Link>
          <Link
            href="/register"
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            免費開始
          </Link>
        </div>
      </nav>

      {isLoading && !staticPost ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : post ? (
        <ArticleContent {...post} />
      ) : (
        <div className="text-center py-20">
          <h2 className="text-xl font-bold text-gray-900">找不到文章</h2>
          <p className="text-gray-500 mt-2">該文章不存在或已被移除</p>
          <Link href="/blog" className="text-blue-600 mt-4 inline-block">
            返回文章列表
          </Link>
        </div>
      )}
    </div>
  );
}
