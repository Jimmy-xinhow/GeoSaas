'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { BlogArticle } from '@/hooks/use-blog';
import { useBlogArticles } from '@/hooks/use-blog';

export default function RelatedArticles({
  slug,
}: {
  slug: string;
  article?: BlogArticle;
}) {
  const { data: relatedArticles } = useBlogArticles({ page: 1 });
  const related = useMemo(() => {
    if (!relatedArticles) return [];
    return relatedArticles.items.filter((a) => a.slug !== slug).slice(0, 3);
  }, [relatedArticles, slug]);

  if (related.length === 0) return null;

  return (
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
  );
}
