'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Eye, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSuccessCase, type SuccessCase, type SimilarSuccessCase } from '@/hooks/use-cases';
import PublicNavbar from '@/components/layout/public-navbar';

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  chatgpt: { label: 'ChatGPT', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  claude: { label: 'Claude', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  Codex: { label: 'Codex', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  codex: { label: 'Codex', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  perplexity: { label: 'Perplexity', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  gemini: { label: 'Gemini', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  copilot: { label: 'Copilot', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  other: { label: '其他 AI', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
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

function getPlatformConfig(platform: string) {
  return PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.other;
}

function SimilarCaseCard({ item }: { item: SimilarSuccessCase }) {
  const platformCfg = getPlatformConfig(item.aiPlatform);
  const hasScore = item.beforeGeoScore != null && item.afterGeoScore != null;

  return (
    <Link
      href={`/cases/${item.id}`}
      className="block rounded-xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-blue-400/40 hover:bg-white/[0.07]"
    >
      <div className="mb-3 flex items-center gap-2">
        <Badge className={platformCfg.color}>{platformCfg.label}</Badge>
        {item.industry && <span className="text-xs text-gray-400">{item.industry}</span>}
      </div>
      <h3 className="line-clamp-2 text-sm font-semibold text-white">{item.title}</h3>
      <p className="mt-2 line-clamp-2 text-xs text-gray-400">「{item.queryUsed}」</p>
      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <span>{hasScore ? `${item.beforeGeoScore} → ${item.afterGeoScore}` : '案例詳情'}</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}

export default function CaseDetailClient({ initialCase }: { initialCase?: SuccessCase }) {
  const params = useParams();
  const id = params.id as string;
  const { data: caseData, isLoading } = useSuccessCase(id);
  const resolvedCase = caseData ?? initialCase;

  if (isLoading && !resolvedCase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!resolvedCase) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-6 text-center">
        <h2 className="text-xl font-bold text-white">找不到這個案例</h2>
        <Link href="/cases" className="text-blue-400 hover:text-blue-300">
          回到成功案例列表
        </Link>
      </div>
    );
  }

  const caseView = { ...resolvedCase, tags: resolvedCase.tags || [] };
  const similarCases = caseView.similarCases || [];
  const platformCfg = getPlatformConfig(caseView.aiPlatform);
  const hasScore = caseView.beforeGeoScore != null && caseView.afterGeoScore != null;
  const scoreGain = hasScore ? caseView.afterGeoScore! - caseView.beforeGeoScore! : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <PublicNavbar />

      <article className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/cases"
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          回到成功案例列表
        </Link>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Badge className={platformCfg.color}>{platformCfg.label}</Badge>
          {caseView.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="border-white/15 text-gray-300">
              {tag}
            </Badge>
          ))}
          <span className="ml-auto flex items-center gap-1 text-xs text-gray-500">
            <Eye className="h-3 w-3" />
            {caseView.viewCount}
          </span>
        </div>

        <h1 className="mb-5 text-3xl font-bold leading-tight text-white md:text-4xl">{caseView.title}</h1>

        {hasScore && (
          <div className="mb-6 grid grid-cols-3 gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div>
              <p className="text-xs text-gray-500">優化前</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{caseView.beforeGeoScore}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">優化後</p>
              <p className="mt-1 text-2xl font-bold text-green-300">{caseView.afterGeoScore}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">提升幅度</p>
              <p className="mt-1 text-2xl font-bold text-blue-300">+{scoreGain}</p>
              {caseView.improvementDays && (
                <p className="mt-1 text-xs text-gray-500">{caseView.improvementDays} 天達成</p>
              )}
            </div>
          </div>
        )}

        <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-1 text-xs text-gray-500">AI 查詢問題</p>
          <p className="font-medium text-white">「{caseView.queryUsed}」</p>
        </div>

        {caseView.aiResponse && (
          <div className="mb-8 rounded-xl border border-blue-400/20 bg-blue-500/10 p-4">
            <p className="mb-2 text-xs font-medium text-blue-300">{platformCfg.label} 回應摘要</p>
            <p className="whitespace-pre-wrap text-sm leading-6 text-gray-300">{caseView.aiResponse}</p>
          </div>
        )}

        {caseView.generatedArticle?.content && (
          <>
            <hr className="mb-8 border-white/10" />
            <div
              className="prose prose-invert prose-lg max-w-none prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(caseView.generatedArticle.content) }}
            />
          </>
        )}

        <section className="mt-10 space-y-6 text-gray-300">
          <div>
            <h2 className="mb-3 text-2xl font-bold text-white">案例重點</h2>
            <p className="leading-7">
              這個案例記錄品牌如何讓 {platformCfg.label} 在回答「{caseView.queryUsed}」時具備可引用的內容線索。
              {hasScore
                ? ` GEO 分數從 ${caseView.beforeGeoScore} 提升到 ${caseView.afterGeoScore}，增加 ${scoreGain} 分。`
                : ' 即使沒有完整分數紀錄，仍可從查詢語句、AI 回應與技術標籤看出可複製的優化路徑。'}
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-lg font-semibold text-white">可複製的做法</h3>
            <ul className="list-disc space-y-2 pl-5 leading-7">
              <li>把品牌事實、服務範圍與常見問題整理成 AI 容易引用的內容。</li>
              <li>補齊 llms.txt、JSON-LD、FAQ Schema、OG Tags 等機器可讀訊號。</li>
              <li>用真實查詢題目反覆驗證 AI 是否能穩定理解品牌定位。</li>
            </ul>
          </div>
        </section>

        {similarCases.length > 0 && (
          <section className="mt-12">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">相似案例</h2>
              <Link href="/cases" className="text-sm text-blue-300 hover:text-blue-200">
                查看全部
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {similarCases.slice(0, 3).map((item) => (
                <SimilarCaseCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <h3 className="text-xl font-bold text-white">也想讓品牌被 AI 引用？</h3>
          <p className="mt-2 text-gray-400">提交你的案例或先建立網站掃描，讓平台整理可被 AI 理解的品牌資料。</p>
          <Link
            href="/dashboard/submit-case"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
          >
            提交成功案例
          </Link>
        </div>
      </article>
    </div>
  );
}
