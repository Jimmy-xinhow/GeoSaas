import Link from 'next/link';
import { ArrowRight, Clock, Tag } from 'lucide-react';
import { getAllPosts } from '@/content/blog/posts';

export const metadata = {
  title: 'Blog — GEO SaaS',
  description: 'AI SEO 優化知識與最新趨勢',
};

const CATEGORY_COLORS: Record<string, string> = {
  '入門教學': 'bg-blue-100 text-blue-700',
  '技術指南': 'bg-purple-100 text-purple-700',
  'AI 趨勢': 'bg-orange-100 text-orange-700',
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="flex items-center justify-between p-4 px-6 lg:px-12 bg-white border-b border-gray-100 sticky top-0 z-50">
        <Link href="/" className="text-xl font-bold text-gray-900">
          GEO SaaS
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/directory"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            目錄
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

      {/* Hero */}
      <section className="py-16 text-center bg-gradient-to-b from-gray-50 to-white">
        <h1 className="text-4xl font-bold text-gray-900">GEO SaaS Blog</h1>
        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
          AI SEO 優化知識、最新趨勢、實用教學
        </p>
      </section>

      {/* Posts Grid */}
      <section className="max-w-4xl mx-auto px-6 py-12 space-y-6">
        {posts.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`}>
            <article className="group border rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer">
              <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    CATEGORY_COLORS[post.category] || 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {post.category}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {post.readTime}
                </span>
                <span>{new Date(post.date).toLocaleDateString('zh-TW')}</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                {post.title}
              </h2>
              <p className="mt-2 text-gray-600 text-sm line-clamp-2">
                {post.description}
              </p>
              <span className="inline-flex items-center gap-1 mt-4 text-sm text-blue-600 font-medium">
                閱讀全文
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
            </article>
          </Link>
        ))}
      </section>
    </div>
  );
}
