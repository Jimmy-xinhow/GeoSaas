'use client';

import { FormEvent, useState } from 'react';
import { Loader2, Pencil, Plus, Power, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  SupportKnowledgeItem,
  UpsertSupportKnowledgePayload,
  useAdminSupportKnowledge,
  useCreateSupportKnowledge,
  useSeedDefaultSupportKnowledge,
  useToggleSupportKnowledge,
  useUpdateSupportKnowledge,
} from '@/hooks/use-support';

const categoryOptions = [
  { value: 'general', label: '一般問題' },
  { value: 'scan', label: '掃描 / GEO 分數' },
  { value: 'llms', label: 'llms.txt / AI 引用' },
  { value: 'content', label: '內容引擎' },
  { value: 'billing', label: '方案 / 點數 / 付款' },
  { value: 'crawler', label: 'AI 爬蟲' },
  { value: 'integration', label: '整合 / 發布 / Badge' },
  { value: 'affiliate', label: '聯盟行銷' },
];

const emptyForm = {
  title: '',
  category: 'general',
  question: '',
  answer: '',
  tags: '',
  priority: 0,
  enabled: true,
};

type KnowledgeFormState = typeof emptyForm;

function toForm(item: SupportKnowledgeItem): KnowledgeFormState {
  return {
    title: item.title,
    category: item.category,
    question: item.question || '',
    answer: item.answer,
    tags: item.tags.join(', '),
    priority: item.priority,
    enabled: item.enabled,
  };
}

function toPayload(form: KnowledgeFormState): UpsertSupportKnowledgePayload {
  return {
    title: form.title.trim(),
    category: form.category,
    question: form.question.trim() || undefined,
    answer: form.answer.trim(),
    tags: form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    priority: Number(form.priority) || 0,
    enabled: form.enabled,
  };
}

export function SupportKnowledgePanel() {
  const { data: items = [], isLoading } = useAdminSupportKnowledge(true);
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<KnowledgeFormState>(emptyForm);
  const createMutation = useCreateSupportKnowledge();
  const updateMutation = useUpdateSupportKnowledge(editingId);
  const toggleMutation = useToggleSupportKnowledge();
  const seedMutation = useSeedDefaultSupportKnowledge();

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const resetForm = () => {
    setEditingId(undefined);
    setForm(emptyForm);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const payload = toPayload(form);
    if (!payload.title || !payload.answer) return;

    if (editingId) {
      updateMutation.mutate(payload, {
        onSuccess: () => {
          toast.success('已更新客服 AI 知識');
          resetForm();
        },
        onError: (error: any) => toast.error(error?.response?.data?.message || '更新失敗'),
      });
      return;
    }

    createMutation.mutate(payload, {
      onSuccess: () => {
        toast.success('已新增客服 AI 知識');
        resetForm();
      },
      onError: (error: any) => toast.error(error?.response?.data?.message || '新增失敗'),
    });
  };

  const syncDefaults = () => {
    seedMutation.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(`預設知識庫已同步：新增 ${result.created} 筆，更新 ${result.updated} 筆`);
      },
      onError: (error: any) => toast.error(error?.response?.data?.message || '同步預設知識庫失敗'),
    });
  };

  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader>
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              客服 AI 知識庫
            </CardTitle>
            <p className="mt-2 text-sm text-gray-400">
              這些內容會提供給 AI 客服檢索。請寫成可直接回答用戶的事實、規則與處理步驟。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="ml-auto"
            onClick={syncDefaults}
            disabled={seedMutation.isPending}
          >
            {seedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            同步預設知識庫
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-white/10 bg-gray-950/60 p-4">
          <div className="grid gap-2">
            <Label htmlFor="support-kb-title">標題</Label>
            <Input
              id="support-kb-title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="例如：內容生成前資料不足"
            />
          </div>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div className="grid gap-2">
              <Label htmlFor="support-kb-category">分類</Label>
              <select
                id="support-kb-category"
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                className="h-10 rounded-md border border-white/10 bg-gray-950 px-3 text-sm text-white"
              >
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="support-kb-priority">優先級</Label>
              <Input
                id="support-kb-priority"
                type="number"
                value={form.priority}
                onChange={(event) => setForm((current) => ({ ...current, priority: Number(event.target.value) }))}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="support-kb-question">常見問法</Label>
            <Input
              id="support-kb-question"
              value={form.question}
              onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))}
              placeholder="用戶可能會怎麼問？"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="support-kb-answer">AI 可使用的答案</Label>
            <Textarea
              id="support-kb-answer"
              rows={7}
              value={form.answer}
              onChange={(event) => setForm((current) => ({ ...current, answer: event.target.value }))}
              placeholder="寫清楚條件、處理步驟、需要人工接手的邊界。"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="support-kb-tags">標籤</Label>
            <Input
              id="support-kb-tags"
              value={form.tags}
              onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
              placeholder="用逗號分隔，例如 llms.txt, credits, crawler"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              className="h-4 w-4 rounded border-white/20 bg-gray-950"
            />
            啟用這筆知識
          </label>

          <div className="flex gap-2">
            <Button type="submit" disabled={isSaving || !form.title.trim() || !form.answer.trim()}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? '更新知識' : '新增知識'}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm}>
                取消編輯
              </Button>
            )}
          </div>
        </form>

        <div className="space-y-3">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-white/10 bg-gray-950/60 p-4 text-sm text-gray-400">
              目前還沒有客服 AI 知識。可以先同步預設知識庫。
            </p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 bg-gray-950/60 p-4">
                <div className="flex flex-wrap items-start gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{item.title}</h3>
                      <Badge variant="outline">{item.category}</Badge>
                      <Badge className={item.enabled ? 'bg-emerald-500/15 text-emerald-200' : 'bg-gray-500/15 text-gray-300'}>
                        {item.enabled ? '啟用' : '停用'}
                      </Badge>
                    </div>
                    {item.question && <p className="mt-1 text-sm text-gray-400">{item.question}</p>}
                  </div>
                  <div className="ml-auto flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(item.id);
                        setForm(toForm(item));
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate({ id: item.id, enabled: !item.enabled })}
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-gray-300">{item.answer}</p>
                {item.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/10 px-2 py-1 text-xs text-gray-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
