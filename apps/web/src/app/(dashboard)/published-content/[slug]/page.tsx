'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Save, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useClientDailyArticleReview,
  useRepairClientDailyArticleReview,
  useSetClientDailyPublication,
  useUpdateClientDailyArticleReview,
} from '@/hooks/use-client-reports';

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

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!data) return;
    setTitle(data.title || '');
    setDescription(data.description || '');
    setContent(data.content || '');
  }, [data]);

  const dirty = useMemo(() => {
    if (!data) return false;
    return title !== data.title || description !== data.description || content !== data.content;
  }, [content, data, description, title]);

  const blockers = data?.safetyReasons ?? [];
  const hardBlockers = data?.hardBlockers ?? [];
  const canPublish = Boolean(data?.canPublish);
  const publicVisible = Boolean(data?.publicVisible);

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
