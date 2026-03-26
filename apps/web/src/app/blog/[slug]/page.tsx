import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, Tag } from 'lucide-react';
import { getPost, getAllPosts } from '@/content/blog/posts';

interface Props {
  params: { slug: string };
}

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }: Props) {
  const post = getPost(params.slug);
  if (!post) return {};
  return {
    title: `${post.title} — GEO SaaS Blog`,
    description: post.description,
  };
}

export default function BlogPostPage({ params }: Props) {
  const post = getPost(params.slug);
  if (!post) notFound();

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="flex items-center justify-between p-4 px-6 lg:px-12 bg-white border-b border-gray-100 sticky top-0 z-50">
        <Link href="/" className="text-xl font-bold text-gray-900">
          GEO SaaS
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

      {/* Article */}
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
            {post.category}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {post.readTime}
          </span>
          <span>{new Date(post.date).toLocaleDateString('zh-TW')}</span>
        </div>

        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
          {post.title}
        </h1>
        <p className="text-lg text-gray-600 mb-8">{post.description}</p>

        <hr className="mb-8" />

        <div
          className="prose prose-gray prose-lg max-w-none
            prose-headings:text-gray-900 prose-headings:font-bold
            prose-p:text-gray-700 prose-p:leading-relaxed
            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
            prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-gray-900 prose-pre:text-gray-100
            prose-table:border prose-th:bg-gray-50 prose-th:p-3 prose-td:p-3"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(post.content) }}
        />

        {/* CTA */}
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
    </div>
  );
}

/** Simple markdown to HTML converter for blog content */
function markdownToHtml(md: string): string {
  return md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Tables
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split('|').filter(Boolean).map((c) => c.trim());
      return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    })
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Lists
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hluopt])/gm, '')
    // Wrap in paragraphs
    .replace(/^(.+)$/gm, (line) => {
      if (line.startsWith('<')) return line;
      return `<p>${line}</p>`;
    })
    // Clean up
    .replace(/<p><\/p>/g, '')
    .replace(/<p>\s*<\/p>/g, '');
}
