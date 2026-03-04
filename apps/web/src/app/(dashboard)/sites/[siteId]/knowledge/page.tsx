'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  BookOpen,
  Plus,
  Sparkles,
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
  CheckSquare,
  Square,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Building2,
  Save,
  PartyPopper,
  CircleCheck,
  Globe,
  Brain,
  Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useSite, useUpdateSiteProfile, type SiteProfile } from '@/hooks/use-sites'
import {
  useKnowledge,
  useCreateQa,
  useBatchCreateQa,
  useUpdateQa,
  useDeleteQa,
  useAiGenerateQa,
  type QaItem,
  type GeneratedQa,
} from '@/hooks/use-knowledge'

const MAX_QA = 200
const PAGE_SIZE = 20

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  brand: { label: '品牌核心', color: 'bg-blue-100 text-blue-800' },
  industry: { label: '行業知識', color: 'bg-green-100 text-green-800' },
  product: { label: '產品服務', color: 'bg-orange-100 text-orange-800' },
  consumer: { label: '消費者疑慮', color: 'bg-red-100 text-red-800' },
  education: { label: '教育延伸', color: 'bg-purple-100 text-purple-800' },
}

// ── Site Profile Form (collapsible) ──
function ProfileSection({
  siteId,
  profile,
}: {
  siteId: string
  profile?: SiteProfile | null
}) {
  const hasProfile = profile && Object.values(profile).some((v) =>
    Array.isArray(v) ? v.length > 0 : !!v,
  )
  const [isOpen, setIsOpen] = useState(!hasProfile)
  const [form, setForm] = useState<SiteProfile>({
    industry: profile?.industry || '',
    description: profile?.description || '',
    services: profile?.services || '',
    targetAudience: profile?.targetAudience || '',
    location: profile?.location || '',
    keywords: profile?.keywords || [],
    uniqueValue: profile?.uniqueValue || '',
    contactInfo: profile?.contactInfo || '',
  })
  const [keywordsInput, setKeywordsInput] = useState(
    (profile?.keywords || []).join('、'),
  )

  const updateProfile = useUpdateSiteProfile(siteId)

  const handleSave = async () => {
    const keywords = keywordsInput
      .split(/[,，、\s]+/)
      .map((k) => k.trim())
      .filter(Boolean)

    const payload: SiteProfile = { ...form, keywords }
    try {
      await updateProfile.mutateAsync(payload)
      toast.success('基本資訊已儲存')
      setIsOpen(false)
    } catch {
      toast.error('儲存失敗')
    }
  }

  const updateField = (field: keyof SiteProfile, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Card>
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold text-gray-900">網站基本資訊</h2>
          {hasProfile && !isOpen && (
            <span className="text-sm text-muted-foreground ml-2">
              {profile?.industry}
              {profile?.services ? ` · ${profile.services.substring(0, 30)}...` : ''}
            </span>
          )}
          {!hasProfile && (
            <Badge variant="outline" className="text-orange-600 border-orange-300">
              建議填寫
            </Badge>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-500" />
        )}
      </div>

      {isOpen && (
        <CardContent className="pt-0 pb-4">
          <p className="text-sm text-muted-foreground mb-4">
            填寫越詳細，AI 生成的問答和修復內容就越精準
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="industry">行業 / 產業</Label>
              <Input
                id="industry"
                value={form.industry || ''}
                onChange={(e) => updateField('industry', e.target.value)}
                placeholder="例：餐飲業、電子商務、醫療"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="location">營業地區</Label>
              <Input
                id="location"
                value={form.location || ''}
                onChange={(e) => updateField('location', e.target.value)}
                placeholder="例：台北市大安區"
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="description">業務描述</Label>
              <Textarea
                id="description"
                value={form.description || ''}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="簡述您的業務內容、公司定位..."
                className="mt-1"
                rows={2}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="services">主要服務 / 產品</Label>
              <Textarea
                id="services"
                value={form.services || ''}
                onChange={(e) => updateField('services', e.target.value)}
                placeholder="例：客製化皮件、皮革保養、維修服務"
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="targetAudience">目標客群</Label>
              <Input
                id="targetAudience"
                value={form.targetAudience || ''}
                onChange={(e) => updateField('targetAudience', e.target.value)}
                placeholder="例：25-45歲注重品質的消費者"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="keywords">核心關鍵字（用頓號分隔）</Label>
              <Input
                id="keywords"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="例：手工皮件、客製化、真皮包包"
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="uniqueValue">獨特價值 / 競爭優勢</Label>
              <Input
                id="uniqueValue"
                value={form.uniqueValue || ''}
                onChange={(e) => updateField('uniqueValue', e.target.value)}
                placeholder="例：20年職人手工打造，終身保固"
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="contactInfo">聯絡資訊</Label>
              <Input
                id="contactInfo"
                value={form.contactInfo || ''}
                onChange={(e) => updateField('contactInfo', e.target.value)}
                placeholder="例：service@example.com / 02-1234-5678"
                className="mt-1"
              />
            </div>
          </div>
          <div className="mt-4">
            <Button
              onClick={handleSave}
              disabled={updateProfile.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {updateProfile.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              儲存基本資訊
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ── Inline Q&A Row (compact table-like) ──
function QaRow({
  qa,
  index,
  siteId,
}: {
  qa: QaItem
  index: number
  siteId: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editQuestion, setEditQuestion] = useState(qa.question)
  const [editAnswer, setEditAnswer] = useState(qa.answer)

  const updateMutation = useUpdateQa(siteId)
  const deleteMutation = useDeleteQa(siteId)

  const handleSave = async () => {
    if (!editQuestion.trim() || !editAnswer.trim()) return
    try {
      await updateMutation.mutateAsync({
        qaId: qa.id,
        question: editQuestion.trim(),
        answer: editAnswer.trim(),
      })
      setIsEditing(false)
      toast.success('已更新')
    } catch {
      toast.error('更新失敗')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(qa.id)
      toast.success('已刪除')
    } catch {
      toast.error('刪除失敗')
    }
  }

  if (isEditing) {
    return (
      <div className="border-b last:border-b-0 p-3 bg-blue-50/50">
        <div className="space-y-2">
          <div>
            <Label className="text-xs">問題</Label>
            <Textarea
              value={editQuestion}
              onChange={(e) => setEditQuestion(e.target.value)}
              className="mt-0.5 text-sm bg-white"
              rows={2}
            />
          </div>
          <div>
            <Label className="text-xs">回答</Label>
            <Textarea
              value={editAnswer}
              onChange={(e) => setEditAnswer(e.target.value)}
              className="mt-0.5 text-sm bg-white"
              rows={3}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="h-7 text-xs"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Check className="h-3 w-3 mr-1" />
              )}
              儲存
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                setEditQuestion(qa.question)
                setEditAnswer(qa.answer)
                setIsEditing(false)
              }}
            >
              取消
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border-b last:border-b-0 hover:bg-gray-50 transition-colors">
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-xs text-muted-foreground w-8 text-right flex-shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {qa.question}
          </p>
          {!isExpanded && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {qa.answer.substring(0, 80)}
              {qa.answer.length > 80 ? '...' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation()
              setIsEditing(true)
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
            onClick={(e) => {
              e.stopPropagation()
              handleDelete()
            }}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>
      {isExpanded && (
        <div className="px-3 pb-3 pl-14">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {qa.answer}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Add Q&A Form (inline) ──
function AddQaForm({
  siteId,
  onClose,
}: {
  siteId: string
  onClose: () => void
}) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const createMutation = useCreateQa(siteId)

  const handleSubmit = async () => {
    if (!question.trim() || !answer.trim()) return
    try {
      await createMutation.mutateAsync({
        question: question.trim(),
        answer: answer.trim(),
      })
      setQuestion('')
      setAnswer('')
      onClose()
      toast.success('問答已新增')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '新增失敗')
    }
  }

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardContent className="p-4 space-y-3">
        <div>
          <Label className="text-sm">問題</Label>
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例：你們的服務如何收費？"
            className="mt-1 bg-white text-sm"
            rows={2}
          />
        </div>
        <div>
          <Label className="text-sm">回答</Label>
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="例：我們提供免費方案和 Pro 方案，Pro 方案每月 NT$990..."
            className="mt-1 bg-white text-sm"
            rows={3}
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSubmit}
            disabled={createMutation.isPending || !question.trim() || !answer.trim()}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5 mr-1" />
            )}
            新增
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            取消
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── AI Generating Progress ──
const AI_PROGRESS_STEPS = [
  { icon: Globe, label: '正在分析網站內容...' },
  { icon: Brain, label: '生成「品牌核心」問答...' },
  { icon: Brain, label: '生成「行業知識」問答...' },
  { icon: Brain, label: '生成「產品服務」問答...' },
  { icon: Brain, label: '生成「消費者疑慮」問答...' },
  { icon: Brain, label: '生成「教育延伸」問答...' },
  { icon: Filter, label: '品質篩選中...' },
]

function AiGeneratingProgress() {
  const [step, setStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setStep((prev) => (prev < AI_PROGRESS_STEPS.length - 1 ? prev + 1 : prev))
    }, 4000)
    const timerInterval = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)
    return () => {
      clearInterval(stepInterval)
      clearInterval(timerInterval)
    }
  }, [])

  const progress = Math.min(((step + 1) / AI_PROGRESS_STEPS.length) * 100, 95)

  return (
    <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
      <CardContent className="py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <Sparkles className="h-6 w-6 text-purple-600 animate-pulse" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">AI 正在生成問答</h3>
            <p className="text-xs text-muted-foreground">
              已經過 {elapsed} 秒，5 個分類同時生成中...
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div
            className="bg-purple-600 h-2 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {AI_PROGRESS_STEPS.map((s, i) => {
            const StepIcon = s.icon
            const isDone = i < step
            const isCurrent = i === step
            return (
              <div
                key={i}
                className={`flex items-center gap-2 text-sm transition-opacity ${
                  isDone ? 'opacity-50' : isCurrent ? 'opacity-100' : 'opacity-30'
                }`}
              >
                {isDone ? (
                  <CircleCheck className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 text-purple-600 animate-spin flex-shrink-0" />
                ) : (
                  <StepIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                <span className={isCurrent ? 'font-medium text-purple-700' : 'text-gray-600'}>
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ── AI Generation Complete Banner ──
function AiCompleteBanner({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-4 shadow-lg animate-in fade-in slide-in-from-top-2 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PartyPopper className="h-6 w-6" />
          <div>
            <p className="font-bold text-lg">AI 生成完成！</p>
            <p className="text-sm text-green-100">
              共產生 {count} 筆高品質問答，請在下方選取並編輯後儲存
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/20 h-8 w-8 p-0"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ── AI Generate Preview with Two-Column Layout ──
function AiGeneratePreview({
  items: initialItems,
  siteId,
  onClose,
  onSaved,
  onContinueGenerate,
  isContinuing,
}: {
  items: GeneratedQa[]
  siteId: string
  onClose: () => void
  onSaved?: (remainingItems: GeneratedQa[]) => void
  onContinueGenerate?: () => void
  isContinuing?: boolean
}) {
  const [items, setItems] = useState<GeneratedQa[]>(initialItems)
  const [focusedIndex, setFocusedIndex] = useState<number>(0)
  const prevLengthRef = useRef(initialItems.length)

  // Sync when new items are appended (continue generate)
  useEffect(() => {
    if (initialItems.length > prevLengthRef.current) {
      setItems(initialItems)
      prevLengthRef.current = initialItems.length
    }
  }, [initialItems])

  const categories = useMemo(() => {
    const cats = new Map<string, GeneratedQa[]>()
    for (const item of items) {
      const cat = item.category || 'brand'
      if (!cats.has(cat)) cats.set(cat, [])
      cats.get(cat)!.push(item)
    }
    return cats
  }, [items])

  const categoryKeys = useMemo(() => Array.from(categories.keys()), [categories])
  const [activeTab, setActiveTab] = useState<string>(categoryKeys[0] || 'brand')
  const [selected, setSelected] = useState<Set<number>>(
    new Set(initialItems.map((_, i) => i)),
  )
  const batchCreate = useBatchCreateQa(siteId)

  // Keep new items auto-selected when continue generating
  useEffect(() => {
    if (items.length > selected.size) {
      const next = new Set(selected)
      for (let i = 0; i < items.length; i++) next.add(i)
      setSelected(next)
    }
  }, [items.length])

  const toggleItem = (index: number) => {
    const next = new Set(selected)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    setSelected(next)
  }

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map((_, i) => i)))
  }

  const toggleCategory = (cat: string) => {
    const catItems = items.reduce<number[]>((acc, item, i) => {
      if ((item.category || 'brand') === cat) acc.push(i)
      return acc
    }, [])
    const allSelected = catItems.every((i) => selected.has(i))
    const next = new Set(selected)
    for (const i of catItems) {
      if (allSelected) next.delete(i)
      else next.add(i)
    }
    setSelected(next)
  }

  const handleSave = async () => {
    const selectedItems = items
      .filter((_, i) => selected.has(i))
      .map(({ question, answer, category }) => ({ question, answer, category }))
    if (selectedItems.length === 0) return
    try {
      await batchCreate.mutateAsync(selectedItems)
      toast.success(`已儲存 ${selectedItems.length} 筆問答`)

      // Remove saved items, keep unsaved ones in the panel
      const remaining = items.filter((_, i) => !selected.has(i))
      setItems(remaining)
      setSelected(new Set())
      setFocusedIndex(0)

      if (onSaved) {
        onSaved(remaining)
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '儲存失敗')
    }
  }

  const getGlobalIndex = (cat: string, localIndex: number): number => {
    let count = 0
    for (let i = 0; i < items.length; i++) {
      if ((items[i].category || 'brand') === cat) {
        if (count === localIndex) return i
        count++
      }
    }
    return -1
  }

  const updateItem = (index: number, field: 'question' | 'answer', value: string) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const currentItems = categories.get(activeTab) || []
  const focusedItem = items[focusedIndex]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-purple-700 flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI 建議的問答（共 {items.length} 筆） — 已選取 {selected.size}/{items.length}
          </h3>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAll}>
            {selected.size === items.length ? '取消全選' : '全選'}
          </Button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1 flex-wrap mb-3">
        {categoryKeys.map((cat) => {
          const catInfo = CATEGORY_MAP[cat] || { label: cat, color: 'bg-gray-100 text-gray-800' }
          const catItems = categories.get(cat) || []
          const catSelectedCount = catItems.reduce((acc, _, localIdx) => {
            const globalIdx = getGlobalIndex(cat, localIdx)
            return acc + (selected.has(globalIdx) ? 1 : 0)
          }, 0)
          return (
            <button
              key={cat}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
                activeTab === cat
                  ? catInfo.color + ' ring-2 ring-offset-1 ring-purple-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              onClick={() => setActiveTab(cat)}
            >
              {catInfo.label} ({catSelectedCount}/{catItems.length})
            </button>
          )
        })}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10">
          <CircleCheck className="h-12 w-12 text-green-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">所有問答已儲存</h3>
          <p className="text-sm text-muted-foreground mb-4">
            可以點「繼續生成更多」來新增更多問答，或關閉此面板
          </p>
          <div className="flex gap-2 justify-center">
            {onContinueGenerate && (
              <Button variant="outline" onClick={onContinueGenerate} disabled={isContinuing}>
                {isContinuing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                繼續生成更多
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              關閉
            </Button>
          </div>
        </div>
      ) : (
      <>
      {/* Category select/deselect */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">
          {CATEGORY_MAP[activeTab]?.label || activeTab}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => toggleCategory(activeTab)}
        >
          切換此分類全選
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-3" style={{ minHeight: '420px' }}>
        {/* Left: Item list */}
        <div className="w-2/5 border rounded-lg overflow-y-auto" style={{ maxHeight: '420px' }}>
          {currentItems.map((item, localIndex) => {
            const globalIndex = getGlobalIndex(activeTab, localIndex)
            const isSelected = selected.has(globalIndex)
            const isFocused = focusedIndex === globalIndex
            return (
              <div
                key={globalIndex}
                className={`flex items-start gap-2 p-2 border-b last:border-b-0 cursor-pointer transition-colors ${
                  isFocused
                    ? 'bg-purple-100 border-l-2 border-l-purple-500'
                    : isSelected
                      ? 'bg-purple-50/50'
                      : 'bg-white opacity-60'
                }`}
                onClick={() => setFocusedIndex(globalIndex)}
              >
                <div
                  className="mt-0.5 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleItem(globalIndex)
                  }}
                >
                  {isSelected ? (
                    <CheckSquare className="h-4 w-4 text-purple-600" />
                  ) : (
                    <Square className="h-4 w-4 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 line-clamp-2">
                    {item.question}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right: Detail / Edit panel */}
        <div className="w-3/5 border rounded-lg p-4 bg-gray-50/50 overflow-y-auto" style={{ maxHeight: '420px' }}>
          {focusedItem ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge
                  className={
                    CATEGORY_MAP[focusedItem.category || 'brand']?.color ||
                    'bg-gray-100 text-gray-800'
                  }
                >
                  {CATEGORY_MAP[focusedItem.category || 'brand']?.label ||
                    focusedItem.category}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  #{focusedIndex + 1}
                </span>
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-700">問題</Label>
                <Textarea
                  value={focusedItem.question}
                  onChange={(e) => updateItem(focusedIndex, 'question', e.target.value)}
                  className="mt-1 text-sm bg-white"
                  rows={2}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-700">回答</Label>
                <Textarea
                  value={focusedItem.answer}
                  onChange={(e) => updateItem(focusedIndex, 'answer', e.target.value)}
                  className="mt-1 text-sm bg-white"
                  rows={8}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {focusedItem.answer.length} 字
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              點擊左側項目以預覽和編輯
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-3">
        <Button
          className="bg-purple-600 hover:bg-purple-700 text-white"
          onClick={handleSave}
          disabled={batchCreate.isPending || selected.size === 0}
        >
          {batchCreate.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          儲存選取的 {selected.size} 筆
        </Button>
        {onContinueGenerate && (
          <Button
            variant="outline"
            onClick={onContinueGenerate}
            disabled={isContinuing}
          >
            {isContinuing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            繼續生成更多
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
      </div>
      </>
      )}
    </div>
  )
}

// ── Saved Q&A Edit Panel (shows when clicking a saved Q&A) ──
function SavedQaEditor({
  qa,
  siteId,
  onClose,
}: {
  qa: QaItem
  siteId: string
  onClose: () => void
}) {
  const [editQuestion, setEditQuestion] = useState(qa.question)
  const [editAnswer, setEditAnswer] = useState(qa.answer)
  const updateMutation = useUpdateQa(siteId)
  const deleteMutation = useDeleteQa(siteId)

  useEffect(() => {
    setEditQuestion(qa.question)
    setEditAnswer(qa.answer)
  }, [qa.id, qa.question, qa.answer])

  const hasChanges = editQuestion !== qa.question || editAnswer !== qa.answer

  const handleSave = async () => {
    if (!editQuestion.trim() || !editAnswer.trim()) return
    try {
      await updateMutation.mutateAsync({
        qaId: qa.id,
        question: editQuestion.trim(),
        answer: editAnswer.trim(),
      })
      toast.success('已更新')
    } catch {
      toast.error('更新失敗')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(qa.id)
      toast.success('已刪除')
      onClose()
    } catch {
      toast.error('刪除失敗')
    }
  }

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Pencil className="h-3.5 w-3.5" />
            編輯問答
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3 mr-1" />
              )}
              刪除
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
              <X className="h-3 w-3 mr-1" />
              收起
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-semibold text-gray-700">問題</Label>
            <Textarea
              value={editQuestion}
              onChange={(e) => setEditQuestion(e.target.value)}
              className="mt-1 text-sm bg-white"
              rows={2}
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-700">回答</Label>
            <Textarea
              value={editAnswer}
              onChange={(e) => setEditAnswer(e.target.value)}
              className="mt-1 text-sm bg-white"
              rows={6}
            />
            <p className="text-xs text-muted-foreground mt-1">{editAnswer.length} 字</p>
          </div>
          {hasChanges && (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Check className="h-3 w-3 mr-1" />
                )}
                儲存修改
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditQuestion(qa.question)
                  setEditAnswer(qa.answer)
                }}
              >
                還原
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Pagination ──
function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
        className="h-8"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
        <Button
          key={page}
          variant={page === currentPage ? 'default' : 'outline'}
          size="sm"
          onClick={() => onPageChange(page)}
          className="h-8 w-8 p-0"
        >
          {page}
        </Button>
      ))}
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        className="h-8"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

// ── Loading skeleton ──
function KnowledgeSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}

// ── Main Page ──
export default function KnowledgePage() {
  const params = useParams()
  const siteId = params.siteId as string

  const { data: site, isLoading: siteLoading } = useSite(siteId)
  const { data: qas, isLoading: qasLoading } = useKnowledge(siteId)

  const [showAddForm, setShowAddForm] = useState(false)
  const [aiResults, setAiResults] = useState<GeneratedQa[] | null>(null)
  const [isContinuing, setIsContinuing] = useState(false)
  const [showCompleteBanner, setShowCompleteBanner] = useState(false)
  const [completedCount, setCompletedCount] = useState(0)
  const [editingQaId, setEditingQaId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const aiGenerate = useAiGenerateQa(siteId)
  const deleteMutation = useDeleteQa(siteId)

  const editingQa = useMemo(
    () => (editingQaId ? qas?.find((q) => q.id === editingQaId) || null : null),
    [qas, editingQaId],
  )

  // Clear editing if the item was deleted
  useEffect(() => {
    if (editingQaId && qas && !qas.find((q) => q.id === editingQaId)) {
      setEditingQaId(null)
    }
  }, [qas, editingQaId])

  const handleAiGenerate = async () => {
    setShowCompleteBanner(false)
    try {
      const results = await aiGenerate.mutateAsync(undefined)
      if (!results || results.length === 0) {
        toast.error('AI 未能生成任何問答，請確認 API Key 設定後再試')
        return
      }
      setAiResults(results)
      setCompletedCount(results.length)
      setShowCompleteBanner(true)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'AI 生成失敗')
    }
  }

  const handleContinueGenerate = async () => {
    if (!aiResults) return
    setIsContinuing(true)
    setShowCompleteBanner(false)
    try {
      const excludeQuestions = aiResults.map((item) => item.question)
      const newResults = await aiGenerate.mutateAsync(excludeQuestions)
      if (!newResults || newResults.length === 0) {
        toast.info('AI 沒有生成更多新問答')
        return
      }
      setAiResults((prev) => [...(prev || []), ...newResults])
      setCompletedCount(newResults.length)
      setShowCompleteBanner(true)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '繼續生成失敗')
    } finally {
      setIsContinuing(false)
    }
  }

  const handleSaveAndKeepPanel = (remainingItems: GeneratedQa[]) => {
    if (remainingItems.length === 0) {
      setAiResults(null)
    } else {
      setAiResults(remainingItems)
    }
  }

  // Category counts for filter tabs
  const categoryCounts = useMemo(() => {
    if (!qas) return {}
    const counts: Record<string, number> = {}
    for (const qa of qas) {
      const cat = qa.category || '_none'
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [qas])

  // Filter Q&As by search + category
  const filteredQas = useMemo(() => {
    if (!qas) return []
    let result = qas
    if (activeCategory) {
      result = result.filter((qa) => (qa.category || '_none') === activeCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (qa) =>
          qa.question.toLowerCase().includes(q) ||
          qa.answer.toLowerCase().includes(q),
      )
    }
    return result
  }, [qas, searchQuery, activeCategory])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredQas.length / PAGE_SIZE))
  const paginatedQas = filteredQas.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  // Reset page when search/category changes
  const handleSearch = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1)
  }
  const handleCategoryFilter = (cat: string | null) => {
    setActiveCategory(cat)
    setCurrentPage(1)
  }

  const isLoading = siteLoading || qasLoading
  const qaCount = qas?.length ?? 0

  if (isLoading) {
    return <KnowledgeSkeleton />
  }

  if (!site) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-gray-900">找不到網站</h2>
          <p className="text-muted-foreground mt-1">
            該網站不存在或您無權存取
          </p>
          <Link href="/sites">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回網站列表
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href={`/sites/${siteId}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        返回網站詳情
      </Link>

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">知識庫</h1>
            <p className="text-sm text-muted-foreground">
              {site.name} — AI 搜尋引擎收錄用問答
            </p>
          </div>
        </div>
      </div>

      {/* Section A: Site Profile */}
      <ProfileSection
        siteId={siteId}
        profile={(site as any).profile}
      />

      {/* AI Generation Progress */}
      {aiGenerate.isPending && !isContinuing && <AiGeneratingProgress />}

      {/* AI Generation Complete Banner */}
      {showCompleteBanner && (
        <AiCompleteBanner
          count={completedCount}
          onDismiss={() => setShowCompleteBanner(false)}
        />
      )}

      {/* Add form */}
      {showAddForm && (
        <AddQaForm siteId={siteId} onClose={() => setShowAddForm(false)} />
      )}

      {/* Persistent Workspace Panel */}
      <Card className="border-purple-200">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Pencil className="h-4 w-4 text-purple-600" />
              問答工作區
            </CardTitle>
            {aiResults && aiResults.length > 0 && (
              <Badge className="bg-purple-100 text-purple-800">
                {aiResults.length} 筆 AI 建議待處理
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {aiResults && aiResults.length > 0 ? (
            /* Has AI results: show two-column layout */
            <AiGeneratePreview
              items={aiResults}
              siteId={siteId}
              onClose={() => setAiResults(null)}
              onSaved={handleSaveAndKeepPanel}
              onContinueGenerate={handleContinueGenerate}
              isContinuing={isContinuing}
            />
          ) : editingQa ? (
            /* No AI results, editing a saved Q&A */
            <SavedQaEditor
              qa={editingQa}
              siteId={siteId}
              onClose={() => setEditingQaId(null)}
            />
          ) : (
            /* Empty state */
            <div className="text-center py-8 text-muted-foreground">
              <Pencil className="h-8 w-8 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">
                點擊下方問答以編輯，或使用
                <Button
                  variant="link"
                  size="sm"
                  className="px-1 text-purple-600"
                  onClick={handleAiGenerate}
                  disabled={aiGenerate.isPending || qaCount >= MAX_QA}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  AI 生成
                </Button>
                新問答
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section B: Saved Q&A List with category badges */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜尋問答..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <Badge variant="secondary" className="flex-shrink-0">
                {qaCount}/{MAX_QA}
              </Badge>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAiGenerate}
                disabled={aiGenerate.isPending || qaCount >= MAX_QA}
              >
                {aiGenerate.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1.5" />
                )}
                AI 生成問答
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setShowAddForm(true)}
                disabled={showAddForm || qaCount >= MAX_QA}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                手動新增
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Category filter tabs */}
        {qaCount > 0 && (
          <div className="px-6 pb-3 flex gap-1.5 flex-wrap">
            <button
              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                activeCategory === null
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              onClick={() => handleCategoryFilter(null)}
            >
              全部 ({qaCount})
            </button>
            {Object.entries(CATEGORY_MAP).map(([key, { label, color }]) => {
              const count = categoryCounts[key] || 0
              if (count === 0) return null
              return (
                <button
                  key={key}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                    activeCategory === key
                      ? color + ' ring-2 ring-offset-1 ring-gray-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  onClick={() => handleCategoryFilter(key)}
                >
                  {label} ({count})
                </button>
              )
            })}
          </div>
        )}

        <CardContent className="pt-0">
          {qaCount === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                尚未建立知識庫
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                新增問答或使用 AI 自動生成，讓修復工具產出更準確的內容
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAiGenerate}
                  disabled={aiGenerate.isPending}
                >
                  {aiGenerate.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  AI 自動生成
                </Button>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => setShowAddForm(true)}
                  disabled={showAddForm}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  手動新增
                </Button>
              </div>
            </div>
          ) : filteredQas.length === 0 ? (
            <div className="text-center py-8">
              <Search className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                找不到符合「{searchQuery}」的問答
              </p>
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden divide-y">
                {paginatedQas.map((qa, i) => {
                  const isEditing = editingQaId === qa.id
                  const globalIndex = (currentPage - 1) * PAGE_SIZE + i + 1
                  return (
                    <div
                      key={qa.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                        isEditing
                          ? 'bg-blue-50 border-l-2 border-l-blue-500'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setEditingQaId(isEditing ? null : qa.id)}
                    >
                      <span className="text-xs text-muted-foreground w-6 text-right flex-shrink-0">
                        {globalIndex}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {qa.question}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {qa.answer.substring(0, 80)}
                          {qa.answer.length > 80 ? '...' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingQaId(qa.id)
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteMutation.mutateAsync(qa.id).then(() => toast.success('已刪除')).catch(() => toast.error('刪除失敗'))
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
