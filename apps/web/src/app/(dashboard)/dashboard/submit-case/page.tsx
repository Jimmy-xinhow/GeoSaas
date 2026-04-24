'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trophy, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { useSites } from '@/hooks/use-sites';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScreenshotUpload } from '@/components/ui/screenshot-upload';

const PLATFORMS = [
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'claude', label: 'Claude' },
  { value: 'perplexity', label: 'Perplexity' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'other', label: '其他' },
];

const INDUSTRIES = [
  '餐飲 / 食品',
  '美容 / 美髮 / 醫美',
  '汽車 / 車輛服務',
  '醫療 / 健康',
  '教育 / 才藝',
  '服飾 / 配件',
  '旅遊 / 住宿',
  '科技 / 軟體',
  '金融 / 保險',
  '房產 / 建設',
  '專業服務 / 顧問',
  '其他',
];

const SUGGESTED_TAGS = [
  'JSON-LD',
  'llms.txt',
  'FAQ Schema',
  'OG Tags',
  'Meta Description',
  '標題優化',
  '圖片 Alt',
  '聯絡資訊',
];

interface FormState {
  title: string;
  industry: string;
  siteId: string;
  aiPlatform: string;
  queryUsed: string;
  aiResponse: string;
  screenshotUrl: string | null;
  beforeGeoScore: string;
  afterGeoScore: string;
  improvementDays: string;
  tags: string[];
}

const INITIAL: FormState = {
  title: '',
  industry: '',
  siteId: '',
  aiPlatform: '',
  queryUsed: '',
  aiResponse: '',
  screenshotUrl: null,
  beforeGeoScore: '',
  afterGeoScore: '',
  improvementDays: '',
  tags: [],
};

export default function SubmitCasePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL);
  const { data: sites } = useSites();

  const update = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const toggleTag = (tag: string) =>
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag)
        ? f.tags.filter((t) => t !== tag)
        : f.tags.length >= 10
          ? f.tags
          : [...f.tags, tag],
    }));

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        title: form.title.trim(),
        aiPlatform: form.aiPlatform,
        queryUsed: form.queryUsed.trim(),
        aiResponse: form.aiResponse.trim(),
      };
      if (form.industry) payload.industry = form.industry;
      if (form.siteId) payload.siteId = form.siteId;
      if (form.screenshotUrl) payload.screenshotUrl = form.screenshotUrl;
      if (form.beforeGeoScore) payload.beforeGeoScore = parseInt(form.beforeGeoScore, 10);
      if (form.afterGeoScore) payload.afterGeoScore = parseInt(form.afterGeoScore, 10);
      if (form.improvementDays) payload.improvementDays = parseInt(form.improvementDays, 10);
      if (form.tags.length > 0) payload.tags = form.tags;

      const { data } = await apiClient.post('/success-cases', payload);
      return data;
    },
    onSuccess: () => {
      toast.success('案例已送出審核！');
      router.push('/dashboard?caseSubmitted=1');
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join('、') : msg || '送出失敗');
    },
  });

  // Validation per step
  const step1Valid =
    form.title.trim().length >= 10 &&
    form.title.trim().length <= 100 &&
    !!form.aiPlatform;
  const step2Valid =
    form.queryUsed.trim().length >= 5 &&
    form.queryUsed.trim().length <= 200 &&
    form.aiResponse.trim().length >= 20 &&
    form.aiResponse.trim().length <= 2000;
  const step3Valid = true; // Step 3 is all optional

  const goNext = () => {
    if (step === 1 && !step1Valid) {
      toast.error('請完整填寫標題（10–100 字）與 AI 平台');
      return;
    }
    if (step === 2 && !step2Valid) {
      toast.error('請完整填寫提問（5–200 字）與 AI 回應（20–2000 字）');
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="h-6 w-6 text-yellow-400" /> 提交成功案例
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          你的品牌被 AI 引用過嗎？分享真實案例，通過審核後我們會為你免費生成一篇 AI
          分析文章，放在 geovault.app 供 AI 爬蟲引用，增加更多曝光。
        </p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex-1 flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                s < step
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                  : s === step
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/5 text-gray-500 border border-white/10'
              }`}
            >
              {s < step ? <Check className="h-4 w-4" /> : s}
            </div>
            {s < 4 && (
              <div
                className={`h-[2px] flex-1 ${
                  s < step ? 'bg-green-500/40' : 'bg-white/10'
                }`}
              />
            )}
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-400 flex gap-8">
        <span className={step === 1 ? 'text-white' : ''}>1. 基本資訊</span>
        <span className={step === 2 ? 'text-white' : ''}>2. AI 引用詳情</span>
        <span className={step === 3 ? 'text-white' : ''}>3. 截圖與數據</span>
        <span className={step === 4 ? 'text-white' : ''}>4. 確認送出</span>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          {/* Step 1 */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="title">案例標題 *</Label>
                <Input
                  id="title"
                  placeholder="例：詹大汽車精品被 Perplexity 推薦為自助鍍膜首選"
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  maxLength={100}
                />
                <p className="text-xs text-gray-500">
                  10–100 字 · 建議包含品牌名、AI 平台與事件
                  <span className="float-right">{form.title.length}/100</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label>AI 平台 *</Label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <Button
                      key={p.value}
                      type="button"
                      variant={form.aiPlatform === p.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => update('aiPlatform', p.value)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry">行業</Label>
                <select
                  id="industry"
                  value={form.industry}
                  onChange={(e) => update('industry', e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-gray-800 border border-white/10 text-sm"
                >
                  <option value="">（選填）</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </div>

              {sites && sites.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="siteId">綁定你的網站</Label>
                  <select
                    id="siteId"
                    value={form.siteId}
                    onChange={(e) => update('siteId', e.target.value)}
                    className="w-full h-10 px-3 rounded-md bg-gray-800 border border-white/10 text-sm"
                  >
                    <option value="">（選填）</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.url}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    綁定後案例頁會自動連到你的網站，提升 referral traffic
                  </p>
                </div>
              )}
            </>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="queryUsed">你向 AI 問的問題 *</Label>
                <Input
                  id="queryUsed"
                  placeholder="例：台北大安區比較推薦的汽車美容店"
                  value={form.queryUsed}
                  onChange={(e) => update('queryUsed', e.target.value)}
                  maxLength={200}
                />
                <p className="text-xs text-gray-500">
                  5–200 字 · 越具體越好
                  <span className="float-right">{form.queryUsed.length}/200</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="aiResponse">AI 實際的回應內容 *</Label>
                <Textarea
                  id="aiResponse"
                  rows={10}
                  placeholder="直接把 AI 的回覆文字貼進來，包含引用你品牌的那一段..."
                  value={form.aiResponse}
                  onChange={(e) => update('aiResponse', e.target.value)}
                  maxLength={2000}
                />
                <p className="text-xs text-gray-500">
                  20–2000 字 · 完整貼上 AI 回應比較有說服力
                  <span className="float-right">{form.aiResponse.length}/2000</span>
                </p>
              </div>
            </>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <>
              <div className="space-y-2">
                <Label>截圖（選填，推薦上傳）</Label>
                <ScreenshotUpload
                  value={form.screenshotUrl}
                  onChange={(url) => update('screenshotUrl', url)}
                />
                <p className="text-xs text-gray-500">
                  截下 AI 平台的對話畫面，審核通過率會大幅提升
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="beforeGeoScore">優化前分數</Label>
                  <Input
                    id="beforeGeoScore"
                    type="number"
                    min={0}
                    max={100}
                    value={form.beforeGeoScore}
                    onChange={(e) => update('beforeGeoScore', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="afterGeoScore">優化後分數</Label>
                  <Input
                    id="afterGeoScore"
                    type="number"
                    min={0}
                    max={100}
                    value={form.afterGeoScore}
                    onChange={(e) => update('afterGeoScore', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="improvementDays">耗時（天）</Label>
                  <Input
                    id="improvementDays"
                    type="number"
                    min={1}
                    max={365}
                    value={form.improvementDays}
                    onChange={(e) => update('improvementDays', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>使用的 GEO 技術標籤（最多 10 個）</Label>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_TAGS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        form.tags.includes(t)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/30'
                      }`}
                    >
                      {form.tags.includes(t) ? '✓ ' : '+ '}{t}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  已選 {form.tags.length} / 10
                </p>
              </div>
            </>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold">確認送出</h3>
              <div className="space-y-3 text-sm">
                <Row label="標題" value={form.title} />
                <Row label="AI 平台" value={PLATFORMS.find((p) => p.value === form.aiPlatform)?.label || form.aiPlatform} />
                {form.industry && <Row label="行業" value={form.industry} />}
                {form.siteId && (
                  <Row
                    label="綁定網站"
                    value={sites?.find((s) => s.id === form.siteId)?.name || '-'}
                  />
                )}
                <Row label="提問" value={form.queryUsed} multiline />
                <Row label="AI 回應" value={form.aiResponse} multiline clamp />
                {form.screenshotUrl && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">截圖</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.screenshotUrl}
                      alt="screenshot"
                      className="max-h-48 rounded border border-white/10"
                    />
                  </div>
                )}
                {(form.beforeGeoScore || form.afterGeoScore || form.improvementDays) && (
                  <Row
                    label="數據"
                    value={`${form.beforeGeoScore || '-'} → ${form.afterGeoScore || '-'} 分，耗時 ${form.improvementDays || '-'} 天`}
                  />
                )}
                {form.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">標籤</p>
                    <div className="flex flex-wrap gap-1">
                      {form.tags.map((t) => (
                        <Badge key={t} variant="secondary">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-400 border-t border-white/10 pt-4">
                送出後案例會進入待審核狀態，管理員通常在 1–3 個工作天內完成審核。
                通過後會自動生成文章並通知你。
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> 上一步
            </Button>
            {step < 4 ? (
              <Button type="button" onClick={goNext}>
                下一步 <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending || !step1Valid || !step2Valid}
                className="bg-green-600 hover:bg-green-700"
              >
                {submitMutation.isPending ? '送出中…' : '確認送出審核'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  multiline,
  clamp,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  clamp?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p
        className={`${multiline ? 'whitespace-pre-wrap' : ''} ${
          clamp ? 'line-clamp-4' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}
