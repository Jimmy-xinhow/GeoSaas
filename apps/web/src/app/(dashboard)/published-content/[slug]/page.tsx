'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, Code2, Copy, ExternalLink, Globe2, Save, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useClientDailyArticleReview,
  useClientDailyPublishPackage,
  useRepairClientDailyArticleReview,
  useSetClientDailyPublication,
  useUpdateClientDailyArticleReview,
} from '@/hooks/use-client-reports';

type PublishPackageFormat = 'markdown' | 'cmsHtml' | 'jsonLdScript' | 'htmlDocument';

const PUBLISH_FORMAT_LABELS: Record<PublishPackageFormat, string> = {
  markdown: 'Markdown',
  cmsHtml: 'CMS HTML',
  jsonLdScript: 'JSON-LD',
  htmlDocument: '完整 HTML',
};

function getErrorMessage(err: unknown): string {
  const data = (err as any)?.response?.data;
  const message = data?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(data?.blockers)) return `仍有阻擋原因：${data.blockers.join('、')}`;
  return '處理失敗，請稍後再試';
}

export default function PublishedContentReviewPage() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const { data, isLoading, refetch } = useClientDailyArticleReview(slug);
  const updateMutation = useUpdateClientDailyArticleReview(slug);
  const repairMutation = useRepairClientDailyArticleReview(slug);
  const publicationMutation = useSetClientDailyPublication();
  const publicVisible = Boolean(data?.publicVisible);
  // Do not expose the Geovault platform article as a copy/paste package.
  // This stays disabled until a separate official-site adaptation is stored.
  const officialSitePackageEnabled = false;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [canonicalDraft, setCanonicalDraft] = useState('');
  const [publishFormat, setPublishFormat] = useState<PublishPackageFormat>('cmsHtml');
  const [completedVerificationIds, setCompletedVerificationIds] = useState<string[]>([]);
  const publishPackageQuery = useClientDailyPublishPackage(
    slug,
    canonicalUrl,
    officialSitePackageEnabled && publicVisible,
  );
  const publishPackage = publishPackageQuery.data;

  useEffect(() => {
    if (!data) return;
    setTitle(data.title || '');
    setDescription(data.description || '');
    setContent(data.content || '');
  }, [data]);

  useEffect(() => {
    if (!publishPackage || canonicalDraft) return;
    setCanonicalDraft(publishPackage.officialSite.canonicalUrl);
  }, [canonicalDraft, publishPackage]);

  useEffect(() => {
    if (!publishPackage) {
      setCompletedVerificationIds([]);
      return;
    }
    const storageKey = `geo-publish-checks:${slug}:${publishPackage.officialSite.canonicalUrl}`;
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      setCompletedVerificationIds(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []);
    } catch {
      setCompletedVerificationIds([]);
    }
  }, [publishPackage, slug]);

  const dirty = useMemo(() => {
    if (!data) return false;
    return title !== data.title || description !== data.description || content !== data.content;
  }, [content, data, description, title]);

  const blockers = data?.safetyReasons ?? [];
  const hardBlockers = data?.hardBlockers ?? [];
  const canPublish = Boolean(data?.canPublish);

  const publishPackageContent = publishPackage?.formats[publishFormat] ?? '';
  const requiredVerificationSteps = publishPackage?.verificationSteps.filter((step) => step.required) ?? [];
  const completedRequiredSteps = requiredVerificationSteps.filter((step) =>
    completedVerificationIds.includes(step.id),
  ).length;

  function toggleVerificationStep(id: string) {
    if (!publishPackage) return;
    const next = completedVerificationIds.includes(id)
      ? completedVerificationIds.filter((item) => item !== id)
      : [...completedVerificationIds, id];
    setCompletedVerificationIds(next);
    const storageKey = `geo-publish-checks:${slug}:${publishPackage.officialSite.canonicalUrl}`;
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  async function copyText(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    toast.success(`${label}已複製`);
  }

  async function saveDraft() {
    try {
      await updateMutation.mutateAsync({ title, description, content });
      toast.success('已儲存並重新檢查');
      await refetch();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function repairDraft() {
    if (dirty) {
      toast.error('請先儲存草稿，再重新修改');
      return;
    }
    try {
      const repaired = await repairMutation.mutateAsync();
      setTitle(repaired.title || '');
      setDescription(repaired.description || '');
      setContent(repaired.content || '');
      toast.success('已依阻擋原因重新修改，請檢查後再公開');
      await refetch();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function publishArticle() {
    if (dirty) {
      toast.error('請先儲存草稿再公開');
      return;
    }
    try {
      const result: any = await publicationMutation.mutateAsync({ slug, published: true });
      toast.success(result?.repaired ? '已修復並公開' : '已公開');
      await refetch();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" className="w-fit px-0 text-gray-300 hover:text-white" onClick={() => router.push('/published-content')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回發布列表
        </Button>
        <div className="flex flex-wrap gap-2">
          {publicVisible && (
            <a href={data.url} target="_blank" rel="noopener noreferrer">
              <Button type="button" size="sm" variant="outline">
                <ExternalLink className="mr-1 h-4 w-4" />
                開啟公開頁
              </Button>
            </a>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={updateMutation.isPending || repairMutation.isPending}
            onClick={saveDraft}
          >
            <Save className="mr-1 h-4 w-4" />
            {updateMutation.isPending ? '處理中' : dirty ? '儲存草稿並重審' : '重新檢查'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={dirty || repairMutation.isPending || publicVisible}
            onClick={repairDraft}
            className="border-blue-400/40 text-blue-100 hover:bg-blue-500/10"
          >
            <Wand2 className="mr-1 h-4 w-4" />
            {repairMutation.isPending ? '重新修改中' : '依阻擋原因重新修改'}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canPublish || dirty || publicationMutation.isPending || repairMutation.isPending || publicVisible}
            onClick={publishArticle}
          >
            <CheckCircle2 className="mr-1 h-4 w-4" />
            {publicationMutation.isPending ? '公開中' : '修復並公開'}
          </Button>
        </div>
      </div>

      <Card className={publicVisible ? 'border-emerald-500/20' : 'border-amber-400/30 bg-amber-500/5'}>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={publicVisible ? 'default' : 'outline'}>
                  {publicVisible ? '已公開' : data.published ? '公開中但被品質閘門隱藏' : '未公開草稿'}
                </Badge>
                {data.dayType && <Badge variant="outline">{data.dayType}</Badge>}
                {data.site?.name && <Badge variant="secondary">{data.site.name}</Badge>}
              </div>
              <p className="mt-2 break-all text-xs text-gray-400">{data.slug}</p>
            </div>
            <div className="text-xs text-gray-400">
              {data.charLength} 字 · 更新 {new Date(data.updatedAt).toLocaleString('zh-TW')}
            </div>
          </div>
        </CardContent>
      </Card>

      {blockers.length > 0 && (
        <Card className="border-amber-400/30 bg-amber-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-100">
              <AlertTriangle className="h-4 w-4" />
              阻擋原因
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {blockers.map((reason) => (
                <Badge key={reason} variant="outline" className="border-amber-400/40 text-amber-100">
                  {reason}
                </Badge>
              ))}
            </div>
            {hardBlockers.length > 0 ? (
              <p className="text-sm text-amber-100/80">
                這些是硬性阻擋。請在下方內容中移除相關字詞或改寫成中性品牌資料，儲存後系統會重新檢查；清除 blocker 後才會開放公開。
              </p>
            ) : (
              <p className="text-sm text-amber-100/80">
                這些項目可由系統修復。確認內容無誤後可直接按「修復並公開」。
              </p>
            )}
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={dirty || repairMutation.isPending || publicVisible}
                onClick={repairDraft}
                className="border-blue-400/40 text-blue-100 hover:bg-blue-500/10"
              >
                <Wand2 className="mr-2 h-4 w-4" />
                {repairMutation.isPending ? '重新修改中' : '依阻擋原因重新修改文章'}
              </Button>
              {dirty && (
                <p className="mt-2 text-xs text-amber-100/70">
                  目前有未儲存修改。先儲存草稿，系統才能用最新版本重新修復。
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {publicVisible && !officialSitePackageEnabled && (
        <Card className="border-amber-400/30 bg-amber-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-100">
              <AlertTriangle className="h-4 w-4" />
              平台文章不可直接複製到客戶官網
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-amber-50/85">
            <p>
              這篇是 Geovault 平台公開文章。若把全文貼到客戶官網，會形成跨站重複內容，因此目前不提供原文 Markdown、HTML 或 JSON-LD 發布包。
            </p>
            <p>
              客戶官網版本必須以客戶第一方資料重新生成，完成獨立內容與品質檢查後，才會提供官網專用結構化資料。
            </p>
          </CardContent>
        </Card>
      )}

      {publicVisible && officialSitePackageEnabled && (
        <Card className="border-blue-400/25 bg-blue-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="h-5 w-5 text-blue-300" />
              貼到客戶官方網站（手動發布包）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-blue-400/20 bg-blue-500/10 p-4 text-sm leading-6 text-blue-50/90">
              <p className="font-medium text-blue-100">不需要為了一般 CMS 去修改後端程式碼。</p>
              <p className="mt-1">
                AI 爬蟲讀的是公開網址回傳的 HTML。WordPress、Webflow、Squarespace 等平台只要將文章發布成免登入頁面即可；自建程式網站才需要把 Markdown／HTML 放進專案，使用 SSR 或靜態產生後重新部署。
              </p>
            </div>

            {publishPackageQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : publishPackageQuery.isError || !publishPackage ? (
              <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
                {getErrorMessage(publishPackageQuery.error)}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-200" htmlFor="official-canonical-url">
                    預計發布的正式網址
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="official-canonical-url"
                      type="url"
                      value={canonicalDraft}
                      onChange={(event) => setCanonicalDraft(event.target.value)}
                      className="h-11 min-w-0 flex-1 text-base"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 min-w-[132px]"
                      disabled={!canonicalDraft.trim() || publishPackageQuery.isFetching}
                      onClick={() => setCanonicalUrl(canonicalDraft.trim())}
                    >
                      {publishPackageQuery.isFetching ? '更新中' : '套用正式網址'}
                    </Button>
                  </div>
                  <p className="text-xs leading-5 text-gray-400">
                    必須使用客戶官方網域；如果 CMS 最後產生不同網址，請更新後再複製 JSON-LD 與 meta。
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {(Object.keys(PUBLISH_FORMAT_LABELS) as PublishPackageFormat[]).map((format) => (
                    <Button
                      key={format}
                      type="button"
                      variant={publishFormat === format ? 'default' : 'outline'}
                      className="h-11"
                      onClick={() => setPublishFormat(format)}
                    >
                      {format === 'jsonLdScript' || format === 'htmlDocument' ? (
                        <Code2 className="mr-2 h-4 w-4" />
                      ) : null}
                      {PUBLISH_FORMAT_LABELS[format]}
                    </Button>
                  ))}
                </div>

                <div className="space-y-2">
                  <Textarea
                    aria-label={`${PUBLISH_FORMAT_LABELS[publishFormat]} 發布內容`}
                    readOnly
                    value={publishPackageContent}
                    rows={16}
                    className="min-h-[320px] resize-y font-mono text-sm leading-6 md:min-h-[420px]"
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button
                      type="button"
                      className="h-11"
                      onClick={() => copyText(publishPackageContent, PUBLISH_FORMAT_LABELS[publishFormat])}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      複製 {PUBLISH_FORMAT_LABELS[publishFormat]}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => copyText(publishPackage.formats.metaTags, 'SEO meta')}
                    >
                      複製 SEO meta
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => copyText(publishPackage.formats.llmsTxtEntry, 'llms.txt 索引行')}
                    >
                      複製 llms.txt 索引行
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => copyText(publishPackage.formats.sitemapXmlEntry, 'sitemap XML')}
                    >
                      複製 sitemap XML
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-4">
                    <h3 className="text-sm font-semibold text-emerald-100">每篇都要更新</h3>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-300">
                      {publishPackage.updateMatrix.alwaysUpdate.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-4">
                    <h3 className="text-sm font-semibold text-amber-100">有使用時才更新</h3>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-300">
                      {publishPackage.updateMatrix.updateWhenApplicable.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <h3 className="text-sm font-semibold text-gray-100">通常不用每篇修改</h3>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-300">
                      {publishPackage.updateMatrix.usuallyUnchanged.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {publishPackage.publicationWorkflow.map((phase) => (
                    <div key={phase.phase} className="rounded-lg border border-blue-400/15 bg-blue-500/5 p-4">
                      <h3 className="text-sm font-semibold text-blue-100">{phase.title}</h3>
                      <ol className="mt-3 space-y-2 text-sm leading-6 text-gray-300">
                        {phase.steps.map((step, index) => (
                          <li key={step}>{index + 1}. {step}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">一般 CMS 發布</h3>
                    <ol className="mt-3 space-y-2 text-sm leading-6 text-gray-300">
                      {publishPackage.cmsInstructions.genericCms.map((step, index) => (
                        <li key={step}>{index + 1}. {step}</li>
                      ))}
                    </ol>
                    <details className="mt-4 rounded-md border border-white/10 p-3 text-sm text-gray-300">
                      <summary className="min-h-11 cursor-pointer py-2 font-medium text-blue-200">WordPress 詳細步驟</summary>
                      <ol className="space-y-2 pt-2 leading-6">
                        {publishPackage.cmsInstructions.wordpress.map((step, index) => (
                          <li key={step}>{index + 1}. {step}</li>
                        ))}
                      </ol>
                    </details>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">自建程式網站</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-400">
                      只有這類網站需要更新專案內容檔案；不是把文章藏在後端，而是讓部署後的公開網址直接回傳完整 HTML。
                    </p>
                    <ol className="mt-3 space-y-2 text-sm leading-6 text-gray-300">
                      {publishPackage.crawlerGuidance.codeBasedSiteSteps.map((step, index) => (
                        <li key={step}>{index + 1}. {step}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold text-emerald-100">發布後檢查清單</h3>
                    <Badge variant="outline" className="w-fit border-emerald-400/30 text-emerald-200">
                      必做進度 {completedRequiredSteps}/{requiredVerificationSteps.length}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-emerald-100/75">{publishPackage.reviewReminder.message}</p>
                  <p className="mt-1 text-xs text-emerald-100/60">
                    下次建議檢查：{new Date(publishPackage.reviewReminder.nextReviewAt).toLocaleDateString('zh-TW')}；勾選進度會保留在這台裝置。
                  </p>
                  <ul className="mt-4 space-y-3 text-sm text-gray-300">
                    {publishPackage.verificationSteps.map((step) => (
                      <li key={step.id} className="rounded-md border border-white/10 bg-black/10 p-3">
                        <label className="flex min-h-11 cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-5 w-5 flex-shrink-0 accent-emerald-500"
                            checked={completedVerificationIds.includes(step.id)}
                            onChange={() => toggleVerificationStep(step.id)}
                          />
                          <span>
                            <span className="flex flex-wrap items-center gap-2 font-medium text-white">
                              {step.title}
                              <Badge variant="outline" className={step.required
                                ? 'border-emerald-400/30 text-emerald-200'
                                : 'border-white/10 text-gray-400'}>
                                {step.required ? '必做' : '選做'}
                              </Badge>
                            </span>
                            <span className="mt-1 block leading-6 text-gray-400">怎麼檢查：{step.howToVerify}</span>
                            <span className="block leading-6 text-emerald-100/70">通過標準：{step.successCriteria}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">人工審稿</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-200" htmlFor="client-daily-title">標題</label>
            <Input
              id="client-daily-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-200" htmlFor="client-daily-description">摘要</label>
            <Textarea
              id="client-daily-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="min-h-[140px] resize-y text-base leading-7"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-200" htmlFor="client-daily-content">文章內容</label>
            <Textarea
              id="client-daily-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={34}
              className="min-h-[620px] resize-y font-mono text-base leading-7 md:min-h-[760px]"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">處理步驟</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-300">
          <p>1. 可先按「依阻擋原因重新修改」，系統會依 blocker、品牌資料與 AI 引用標準重寫草稿。</p>
          <p>2. 若人工調整內容，按「儲存草稿並重審」；沒有修改時也可按「重新檢查」重新計算 blocker。</p>
          <p>3. blocker 清除後，按「修復並公開」。公開後才會出現在對外 blog、sitemap 與 llms-full。</p>
          <Link href="/published-content" className="inline-flex text-blue-300 hover:underline">
            回發布列表
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
