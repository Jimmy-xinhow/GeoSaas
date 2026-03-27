'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Award, Clock, Eye, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSuccessCase } from '@/hooks/use-cases';

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  chatgpt: { label: 'ChatGPT', color: 'bg-green-100 text-green-700' },
  claude: { label: 'Claude', color: 'bg-orange-100 text-orange-700' },
  perplexity: { label: 'Perplexity', color: 'bg-blue-100 text-blue-700' },
  gemini: { label: 'Gemini', color: 'bg-purple-100 text-purple-700' },
  other: { label: '其他', color: 'bg-gray-100 text-gray-700' },
};

function markdownToHtml(md: string): string {
  return md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.+)$/gm, (line) => (line.startsWith('<') ? line : `<p>${line}</p>`))
    .replace(/<p><\/p>/g, '');
}

export default function CaseDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: caseData, isLoading } = useSuccessCase(id);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <h2 className="text-xl font-bold">找不到案例</h2>
        <Link href="/cases" className="text-blue-600">返回案例列表</Link>
      </div>
    );
  }

  const platformCfg = PLATFORM_CONFIG[caseData.aiPlatform] || PLATFORM_CONFIG.other;

  return (
    <div className="min-h-screen bg-white">
      <nav className="flex items-center justify-between p-4 px-6 lg:px-12 bg-white border-b border-gray-100 sticky top-0 z-50">
        <Link href="/" className="text-xl font-bold text-gray-900">Geovault</Link>
        <div className="flex items-center gap-6">
          <Link href="/cases" className="text-sm text-gray-600 hover:text-gray-900">案例</Link>
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">登入</Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/cases" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6">
          <ArrowLeft className="h-3.5 w-3.5" />
          返回案例列表
        </Link>

        <div className="flex items-center gap-3 mb-4">
          <Badge className={platformCfg.color}>{platformCfg.label}</Badge>
          {caseData.tags.map((t) => (
            <Badge key={t} variant="outline">{t}</Badge>
          ))}
          <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
            <Eye className="h-3 w-3" />
            {caseData.viewCount}
          </span>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-4">{caseData.title}</h1>

        {/* Score change */}
        {caseData.beforeGeoScore != null && caseData.afterGeoScore != null && (
          <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-red-50 to-green-50 rounded-xl mb-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-400">{caseData.beforeGeoScore}</p>
              <p className="text-xs text-gray-500">優化前</p>
            </div>
            <span className="text-gray-400 text-xl">→</span>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{caseData.afterGeoScore}</p>
              <p className="text-xs text-gray-500">優化後</p>
            </div>
            <div className="text-center ml-auto">
              <p className="text-xl font-bold text-green-600">+{caseData.afterGeoScore - caseData.beforeGeoScore}</p>
              {caseData.improvementDays && (
                <p className="text-xs text-gray-500">{caseData.improvementDays} 天達成</p>
              )}
            </div>
          </div>
        )}

        {/* Query */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <p className="text-xs text-gray-500 mb-1">AI 搜尋問題</p>
          <p className="text-gray-900 font-medium">「{caseData.queryUsed}」</p>
        </div>

        {/* AI Response */}
        {caseData.aiResponse && (
          <div className="bg-blue-50 rounded-xl p-4 mb-8">
            <p className="text-xs text-blue-600 mb-1">{platformCfg.label} 回應</p>
            <p className="text-gray-700 text-sm whitespace-pre-wrap">{caseData.aiResponse}</p>
          </div>
        )}

        {/* Generated article */}
        {caseData.generatedArticle?.content && (
          <>
            <hr className="mb-8" />
            <div
              className="prose prose-gray prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-700"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(caseData.generatedArticle.content) }}
            />
          </>
        )}

        {/* CTA */}
        <div className="mt-12 p-8 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl text-center">
          <h3 className="text-xl font-bold text-gray-900">你的品牌也被 AI 引用了嗎？</h3>
          <p className="mt-2 text-gray-600">分享你的成功故事，獲得更多曝光</p>
          <Link href="/register" className="inline-block mt-4 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700">
            提交我的案例
          </Link>
        </div>
      </article>
    </div>
  );
}
