'use client'

import Link from 'next/link'
import {
  Search, Wrench, Sparkles, Eye, BookOpen, FileText,
  ArrowRight, CheckCircle2, ChevronRight, Globe, XCircle,
  BarChart3, Share2, ClipboardCheck, Zap, Shield, AlertTriangle,
  TrendingUp, ArrowLeft, Building2, MessageSquareQuote,
  Bot, Copy, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import PublicNavbar from '@/components/layout/public-navbar'

/* ─── Mock UI Components ─── */

function MockDashboard() {
  return (
    <div className="bg-gray-950 rounded-xl border border-white/10 overflow-hidden text-xs">
      {/* Top bar */}
      <div className="bg-gray-900 px-3 py-2 flex items-center gap-2 border-b border-white/5">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-yellow-400" />
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-gray-500 ml-2 text-[10px]">geovault.app/dashboard</span>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-gray-400 font-semibold text-sm">總覽</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: Globe, label: '已掃描網站', value: '3', color: 'text-blue-400 bg-blue-500/20' },
            { icon: TrendingUp, label: '平均 GEO 分數', value: '72', color: 'text-green-400 bg-green-500/20' },
            { icon: MessageSquareQuote, label: 'AI 引用次數', value: '18', color: 'text-purple-400 bg-purple-500/20' },
            { icon: FileText, label: '已發布內容', value: '5', color: 'text-orange-400 bg-orange-500/20' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 rounded-lg p-2.5 border border-white/5">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center ${s.color} mb-1.5`}>
                <s.icon className="h-3 w-3" />
              </div>
              <p className="text-lg font-bold text-white">{s.value}</p>
              <p className="text-[9px] text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
        {/* Quick scan */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white/10 rounded px-2 py-1.5 text-gray-500">輸入網址開始掃描...</div>
            <div className="bg-blue-600 text-white px-3 py-1.5 rounded text-[10px] font-medium">開始掃描</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MockScanResult() {
  const indicators = [
    { name: 'JSON-LD 結構化資料', score: 15, status: 'pass' },
    { name: 'llms.txt', score: 0, status: 'fail' },
    { name: 'Open Graph Tags', score: 10, status: 'pass' },
    { name: 'Meta Description', score: 12, status: 'pass' },
    { name: 'FAQ Schema', score: 0, status: 'fail' },
    { name: '標題優化', score: 8, status: 'warning' },
    { name: '聯絡資訊', score: 10, status: 'pass' },
    { name: '圖片 Alt', score: 5, status: 'warning' },
    { name: 'robots.txt AI 政策', score: 12, status: 'pass' },
  ]

  return (
    <div className="bg-gray-950 rounded-xl border border-white/10 overflow-hidden text-xs">
      <div className="bg-gray-900 px-3 py-2 flex items-center gap-2 border-b border-white/5">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-yellow-400" />
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-gray-500 ml-2 text-[10px]">掃描結果</span>
      </div>
      <div className="p-4">
        <div className="flex gap-4">
          {/* Score gauge */}
          <div className="text-center shrink-0">
            <div className="w-20 h-20 rounded-full border-4 border-blue-500 flex items-center justify-center">
              <div>
                <p className="text-2xl font-bold text-white">72</p>
                <p className="text-[8px] text-blue-400">Silver</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-3 mt-2 text-[9px]">
              <span className="text-green-400">✓ 5</span>
              <span className="text-yellow-400">⚠ 2</span>
              <span className="text-red-400">✗ 2</span>
            </div>
          </div>
          {/* Indicators */}
          <div className="flex-1 space-y-1">
            {indicators.map(ind => (
              <div key={ind.name} className="flex items-center gap-2 py-0.5">
                {ind.status === 'pass' ? <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" /> :
                 ind.status === 'warning' ? <AlertTriangle className="h-3 w-3 text-yellow-400 shrink-0" /> :
                 <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
                <span className="text-gray-300 flex-1 truncate">{ind.name}</span>
                <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${ind.status === 'pass' ? 'bg-green-500' : ind.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${(ind.score / 15) * 100}%` }} />
                </div>
                <span className="text-gray-400 w-4 text-right">{ind.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MockFixPage() {
  return (
    <div className="bg-gray-950 rounded-xl border border-white/10 overflow-hidden text-xs">
      <div className="bg-gray-900 px-3 py-2 flex items-center gap-2 border-b border-white/5">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-yellow-400" />
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-gray-500 ml-2 text-[10px]">AI 修復工具</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">修復工具</span>
          <div className="flex gap-1.5 ml-auto">
            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px]">✗ 2 高優先</span>
            <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[9px]">⚠ 1 中優先</span>
            <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 text-[9px]">✓ 6 已通過</span>
          </div>
        </div>
        {/* Fix item */}
        <div className="bg-white/5 rounded-lg border border-white/5 overflow-hidden">
          <div className="px-3 py-2 flex items-center gap-2">
            <XCircle className="h-3 w-3 text-red-400" />
            <span className="text-gray-200">llms.txt</span>
            <span className="ml-auto px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px]">高優先</span>
          </div>
          <div className="px-3 pb-3">
            <div className="bg-blue-600 text-white px-3 py-1.5 rounded text-[10px] font-medium inline-flex items-center gap-1 cursor-pointer">
              <Sparkles className="h-3 w-3" /> 一鍵生成修復程式碼
            </div>
          </div>
          {/* Generated code */}
          <div className="mx-3 mb-3 bg-black/40 rounded-lg p-3 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-green-400">✓ 程式碼已生成</span>
              <div className="flex items-center gap-1 text-gray-500 text-[9px] cursor-pointer hover:text-white">
                <Copy className="h-3 w-3" /> 複製
              </div>
            </div>
            <code className="text-[9px] text-green-400/80 font-mono leading-relaxed block">
              {'# llms.txt'}{'\n'}
              {'# 品牌名稱：你的品牌'}{'\n'}
              {'> 品牌描述與核心服務...'}{'\n'}
              {'\n'}
              {'## 常見問題'}{'\n'}
              {'Q: 你的品牌提供什麼服務？'}{'\n'}
              {'A: 我們提供專業的...'}
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}

function MockKnowledgePage() {
  const qas = [
    { cat: '品牌核心', catColor: 'bg-blue-500/20 text-blue-400', q: '你的品牌提供什麼服務？', a: '我們提供專業的...' },
    { cat: '產品服務', catColor: 'bg-orange-500/20 text-orange-400', q: '價格方案有哪些？', a: '我們提供三種方案...' },
    { cat: '消費者疑慮', catColor: 'bg-red-500/20 text-red-400', q: '如何預約？', a: '可透過官網線上預約...' },
    { cat: '行業知識', catColor: 'bg-green-500/20 text-green-400', q: '這個行業的發展趨勢？', a: '根據市場研究...' },
    { cat: '教育延伸', catColor: 'bg-purple-500/20 text-purple-400', q: '新手應該注意什麼？', a: '建議先從基礎開始...' },
  ]
  return (
    <div className="bg-gray-950 rounded-xl border border-white/10 overflow-hidden text-xs">
      <div className="bg-gray-900 px-3 py-2 flex items-center gap-2 border-b border-white/5">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-yellow-400" />
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-gray-500 ml-2 text-[10px]">品牌知識庫</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold text-white">知識庫 Q&A</span>
            <span className="text-[9px] text-gray-500">共 60 題</span>
          </div>
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-3 py-1.5 rounded text-[10px] font-medium inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> AI 生成知識庫
          </div>
        </div>
        <div className="space-y-1">
          {qas.map(qa => (
            <div key={qa.q} className="bg-white/5 rounded-lg px-3 py-2 flex items-start gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium shrink-0 ${qa.catColor}`}>{qa.cat}</span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-200 font-medium truncate">Q: {qa.q}</p>
                <p className="text-gray-500 truncate">A: {qa.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MockMonitorPage() {
  const platforms = [
    { name: 'ChatGPT', emoji: '🤖', rate: 80, cited: 4, total: 5, color: 'bg-green-500' },
    { name: 'Claude', emoji: '🧠', rate: 60, cited: 3, total: 5, color: 'bg-orange-500' },
    { name: 'Perplexity', emoji: '🔍', rate: 40, cited: 2, total: 5, color: 'bg-blue-500' },
    { name: 'Gemini', emoji: '✨', rate: 20, cited: 1, total: 5, color: 'bg-purple-500' },
  ]
  return (
    <div className="bg-gray-950 rounded-xl border border-white/10 overflow-hidden text-xs">
      <div className="bg-gray-900 px-3 py-2 flex items-center gap-2 border-b border-white/5">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-yellow-400" />
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-gray-500 ml-2 text-[10px]">AI 引用監控</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">AI 引用監控</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {platforms.map(p => (
            <div key={p.name} className="bg-white/5 rounded-lg p-2.5 border border-white/5 text-center">
              <p className="text-lg mb-0.5">{p.emoji}</p>
              <p className="text-[10px] font-medium text-white">{p.name}</p>
              <p className="text-xl font-bold text-white mt-1">{p.rate}%</p>
              <div className="w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                <div className={`h-full rounded-full ${p.color}`} style={{ width: `${p.rate}%` }} />
              </div>
              <p className="text-[8px] text-gray-500 mt-1">已引用 {p.cited}/{p.total}</p>
            </div>
          ))}
        </div>
        {/* Query list */}
        <div className="space-y-1">
          {[
            { q: '推薦台北整復推拿', status: 'cited', platform: 'ChatGPT' },
            { q: '最好的汽車美容品牌', status: 'cited', platform: 'Claude' },
            { q: '台北哪裡有好的按摩', status: 'not_cited', platform: 'Perplexity' },
          ].map(item => (
            <div key={item.q} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
              <span className="text-gray-300 flex-1 truncate">「{item.q}」</span>
              <span className="px-1.5 py-0.5 rounded text-[8px] bg-blue-500/20 text-blue-400">{item.platform}</span>
              {item.status === 'cited' ? (
                <span className="text-green-400 text-[9px]">✓ 已引用</span>
              ) : (
                <span className="text-red-400 text-[9px]">✗ 未引用</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MockContentPage() {
  return (
    <div className="bg-gray-950 rounded-xl border border-white/10 overflow-hidden text-xs">
      <div className="bg-gray-900 px-3 py-2 flex items-center gap-2 border-b border-white/5">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-yellow-400" />
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-gray-500 ml-2 text-[10px]">內容引擎</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-semibold text-white">內容引擎</span>
          </div>
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-3 py-1.5 rounded text-[10px] font-medium">AI 生成</div>
        </div>
        <div className="space-y-1.5">
          {[
            { title: '品牌 GEO 全面分析', type: 'FAQ', typeColor: 'bg-purple-500/20 text-purple-400', status: '已發布', statusColor: 'bg-green-500/20 text-green-400' },
            { title: 'AI 搜尋優化實作指南', type: '文章', typeColor: 'bg-blue-500/20 text-blue-400', status: '已發布', statusColor: 'bg-green-500/20 text-green-400' },
            { title: '品牌知識庫文件', type: '知識庫', typeColor: 'bg-green-500/20 text-green-400', status: '草稿', statusColor: 'bg-gray-500/20 text-gray-400' },
          ].map(c => (
            <div key={c.title} className="bg-white/5 rounded-lg px-3 py-2.5 flex items-center gap-2 border border-white/5">
              <div className="flex-1 min-w-0">
                <p className="text-gray-200 font-medium truncate">{c.title}</p>
              </div>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${c.typeColor}`}>{c.type}</span>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${c.statusColor}`}>{c.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MockPublishPage() {
  return (
    <div className="bg-gray-950 rounded-xl border border-white/10 overflow-hidden text-xs">
      <div className="bg-gray-900 px-3 py-2 flex items-center gap-2 border-b border-white/5">
        <div className="w-2 h-2 rounded-full bg-red-400" />
        <div className="w-2 h-2 rounded-full bg-yellow-400" />
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-gray-500 ml-2 text-[10px]">多平台發佈</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Share2 className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold text-white">多平台佈局</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['Medium', 'LinkedIn', 'WordPress'].map(p => (
            <div key={p} className="bg-white/5 rounded-lg p-3 border border-white/5 text-center">
              <p className="text-sm font-medium text-white">{p}</p>
              <p className="text-[9px] text-green-400 mt-1">已連接</p>
              <div className="bg-blue-600 text-white px-2 py-1 rounded text-[9px] font-medium mt-2">發佈</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Steps Data ─── */
const steps = [
  {
    step: 1, title: '免費掃描你的網站', icon: Search, color: 'blue',
    description: '在首頁輸入你的網址，系統會自動檢測 9 項 AI 可讀性指標，產出你的 GEO 分數。',
    details: [
      '前往首頁，在掃描框輸入你的網站網址',
      '系統自動檢測：JSON-LD、llms.txt、FAQ Schema、OG Tags、Meta Description、標題優化、聯絡資訊、圖片 Alt、robots.txt AI 政策',
      '30 秒內取得 GEO 分數（0-100 分）和各指標狀態',
      '免費帳號每月可掃描 2 次',
    ],
    tip: '第一次掃描不需要註冊！直接在首頁輸入網址就能免費體驗。',
    Demo: MockScanResult,
  },
  {
    step: 2, title: '註冊帳號，進入 Dashboard', icon: Globe, color: 'purple',
    description: '建立帳號後，在 Dashboard 看到完整的品牌 AI 能見度總覽。',
    details: [
      '點擊「免費開始」註冊帳號（Email + 密碼）',
      '登入後進入 Dashboard，一目了然看到所有數據',
      '新增你的網站，系統自動執行首次掃描',
      '追蹤 GEO 分數趨勢變化',
    ],
    tip: 'Free 方案可管理 1 個網站，Starter 和 Pro 方案最多 3 個。',
    Demo: MockDashboard,
  },
  {
    step: 3, title: 'AI 自動修復', icon: Wrench, color: 'green',
    description: '針對掃描結果中缺失的指標，AI 會自動生成修復程式碼，你只需要複製貼上。',
    details: [
      '進入網站詳情頁，點擊「AI 修復」',
      '系統根據你的品牌資料，自動生成 JSON-LD 結構化資料',
      '一鍵生成 llms.txt（讓 AI 爬蟲讀取你的品牌資訊）',
      '生成 FAQ Schema（讓 AI 可以引用你的 Q&A）',
      '將生成的程式碼複製到你的網站 HTML 中',
    ],
    tip: '不懂程式碼也沒關係！系統會生成完整的程式碼片段，你只需要貼到網站的 <head> 標籤裡。WordPress 用戶可使用「自訂 HTML」小工具。',
    Demo: MockFixPage,
  },
  {
    step: 4, title: '建立品牌知識庫', icon: BookOpen, color: 'orange',
    description: 'AI 自動生成 60+ 題品牌 Q&A，讓 ChatGPT、Claude 等 AI 真正「認識」你的品牌。',
    details: [
      '進入網站詳情頁，點擊「知識庫」',
      '點擊「AI 生成知識庫」，系統自動分析你的網站',
      'AI 會生成 5 大分類的 Q&A：品牌核心、產業知識、產品服務、消費者疑慮、教育延伸',
      '每次生成約 60 題，可以多次生成來補充',
      '所有 Q&A 會自動出現在你的 llms-full.txt 中，供 AI 爬蟲抓取',
    ],
    tip: '知識庫越豐富，AI 越容易「認識」你。建議至少生成 2-3 次，累積 100+ 題以上效果最好。',
    Demo: MockKnowledgePage,
  },
  {
    step: 5, title: 'AI 內容生成', icon: Sparkles, color: 'cyan',
    description: '自動生成 FAQ 文章、品牌分析報告、行業報告，持續餵養 AI 搜尋引擎。',
    details: [
      '進入「內容引擎」頁面',
      '選擇內容類型：FAQ、文章、知識庫、新聞稿',
      'AI 根據你的品牌資料和掃描結果自動撰寫',
      '生成的內容可以直接發佈到你的網站或社群平台',
    ],
    tip: '定期產出新內容可以保持 AI 對你品牌的「記憶」。建議每月至少生成 2-3 篇新內容。',
    Demo: MockContentPage,
  },
  {
    step: 6, title: '再次掃描，確認分數提升', icon: BarChart3, color: 'blue',
    description: '完成修復和內容建立後，重新掃描確認 GEO 分數是否提升。',
    details: [
      '回到「我的網站」，點擊「掃描」',
      '比較修復前後的分數變化',
      'Dashboard 上可以看到歷史分數趨勢圖',
      '目標：將分數提升到 70 分以上（Silver 等級以上）',
    ],
    tip: '修復 JSON-LD 和 llms.txt 通常可以讓分數提升 20-40 分。',
    Demo: null,
  },
  {
    step: 7, title: 'AI 引用監控（Pro）', icon: Eye, color: 'green',
    description: '輸入消費者可能問 AI 的問題，即時檢查 5 大 AI 平台是否正在推薦你。',
    details: [
      '進入「AI 監控」頁面',
      '輸入問題，例如：「台北推薦整復推拿」「最好的汽車美容品牌」',
      '系統自動查詢 ChatGPT、Claude、Perplexity、Gemini、Copilot',
      '即時顯示每個平台是否有提到你的品牌',
      '也可以一鍵跑「驗收報告」，從知識庫選題批量測試並產出 PDF',
    ],
    tip: '建議用不同的問法測試，例如「推薦」「最好的」「哪裡有」等不同說法，看哪些問法 AI 會推薦你。',
    Demo: MockMonitorPage,
  },
  {
    step: 8, title: '多平台發佈（Pro）', icon: Share2, color: 'purple',
    description: '將生成的內容同步發佈到 Medium、LinkedIn、WordPress 等平台，擴大品牌曝光。',
    details: [
      '進入「多平台佈局」頁面',
      '連接你的 Medium、LinkedIn、WordPress 帳號',
      '選擇要發佈的內容，一鍵同步到多個平台',
      '越多平台有你的品牌資訊，AI 越容易找到你',
    ],
    tip: '外部平台的內容也會被 AI 爬蟲抓取，越多地方提到你的品牌，AI 推薦你的機率越高。',
    Demo: MockPublishPage,
  },
]

const faqItems = [
  { q: '修復程式碼要貼在哪裡？', a: 'JSON-LD 和 FAQ Schema 要貼在你網站 HTML 的 <head> 標籤內。WordPress 到「外觀 > 小工具」或安裝 Insert Headers and Footers 外掛。Webflow 在 Custom Code 區域。Squarespace 到 Settings > Advanced > Code Injection。' },
  { q: 'llms.txt 要放在哪裡？', a: 'llms.txt 需要放在你網站的根目錄，讓 AI 爬蟲可以透過 yourdomain.com/llms.txt 存取。如果你使用 Geovault 的 llms.txt 託管功能，系統會自動幫你生成並託管，不需要自己設定。' },
  { q: '優化後多久才能被 AI 推薦？', a: '通常完成基礎優化（JSON-LD + llms.txt + 知識庫）後，7-14 天內就能在部分 AI 平台看到改善。完整效果可能需要 1-2 個月，取決於你的行業競爭程度和內容豐富度。' },
  { q: '我有多個分店/品牌，怎麼管理？', a: 'Starter 和 Pro 方案支援最多 3 個網站。每個網站獨立掃描、獨立修復、獨立監控。' },
  { q: '掃描結果的指標是什麼意思？', a: '9 項指標：JSON-LD（結構化資料）、llms.txt（AI 可讀檔）、OG Tags（社群預覽）、Meta Description（頁面描述）、FAQ Schema（問答資料）、標題優化（H1 標籤）、聯絡資訊（地址/電話）、圖片 Alt（圖片說明）、robots.txt AI 政策（是否允許 AI 爬蟲）。' },
  { q: 'GEO 和 SEO 需要分開做嗎？', a: '不需要。GEO 和 SEO 很多工作重疊（結構化資料、Meta Description），做 GEO 優化的同時也會提升 SEO。兩者可以並行。' },
]

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <PublicNavbar />

      {/* Hero */}
      <section className="py-16 lg:py-24 bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium bg-blue-500/20 text-blue-400 mb-6">
            使用教學
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
            從 0 到被 AI 推薦
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-green-400 bg-clip-text text-transparent">
              完整操作指南
            </span>
          </h1>
          <p className="mt-6 text-lg text-gray-400 max-w-2xl mx-auto">
            跟著這 8 個步驟，讓你的品牌在 ChatGPT、Claude、Perplexity、Gemini、Copilot 上被主動推薦
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="py-16 lg:py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="space-y-12">
            {steps.map((item) => {
              const colorMap: Record<string, { badge: string; icon: string; tipBg: string; tipText: string }> = {
                blue: { badge: 'bg-blue-500/20 text-blue-400', icon: 'bg-blue-600', tipBg: 'bg-blue-500/10 border-blue-500/20', tipText: 'text-blue-300' },
                purple: { badge: 'bg-purple-500/20 text-purple-400', icon: 'bg-purple-600', tipBg: 'bg-purple-500/10 border-purple-500/20', tipText: 'text-purple-300' },
                green: { badge: 'bg-green-500/20 text-green-400', icon: 'bg-green-600', tipBg: 'bg-green-500/10 border-green-500/20', tipText: 'text-green-300' },
                orange: { badge: 'bg-orange-500/20 text-orange-400', icon: 'bg-orange-600', tipBg: 'bg-orange-500/10 border-orange-500/20', tipText: 'text-orange-300' },
                cyan: { badge: 'bg-cyan-500/20 text-cyan-400', icon: 'bg-cyan-600', tipBg: 'bg-cyan-500/10 border-cyan-500/20', tipText: 'text-cyan-300' },
              }
              const c = colorMap[item.color]
              const isPro = item.title.includes('Pro')

              return (
                <div key={item.step} className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
                  {/* Header */}
                  <div className="flex items-start gap-4 mb-6">
                    <div className={`w-12 h-12 rounded-2xl ${c.icon} text-white flex items-center justify-center shrink-0 shadow-lg`}>
                      <item.icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>Step {item.step}</span>
                        {isPro && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white">Pro</span>}
                      </div>
                      <h2 className="text-xl font-bold">{item.title}</h2>
                    </div>
                  </div>

                  {/* Two columns: details left, demo right */}
                  <div className="grid lg:grid-cols-2 gap-6">
                    <div>
                      <p className="text-gray-400 mb-4">{item.description}</p>
                      <div className="space-y-2.5 mb-4">
                        {item.details.map((detail, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                            <span className="text-gray-300 text-sm">{detail}</span>
                          </div>
                        ))}
                      </div>
                      <div className={`rounded-xl p-3 border ${c.tipBg}`}>
                        <p className={`text-sm ${c.tipText}`}><strong>Tip：</strong>{item.tip}</p>
                      </div>
                    </div>
                    {/* Demo */}
                    <div>
                      {item.Demo ? <item.Demo /> : (
                        <div className="bg-gray-950 rounded-xl border border-white/10 overflow-hidden text-xs">
                          <div className="bg-gray-900 px-3 py-2 flex items-center gap-2 border-b border-white/5">
                            <div className="w-2 h-2 rounded-full bg-red-400" />
                            <div className="w-2 h-2 rounded-full bg-yellow-400" />
                            <div className="w-2 h-2 rounded-full bg-green-400" />
                            <span className="text-gray-500 ml-2 text-[10px]">分數趨勢</span>
                          </div>
                          <div className="p-4 text-center">
                            <div className="flex items-end justify-center gap-1 h-20">
                              {[35, 42, 55, 63, 72, 78].map((v, i) => (
                                <div key={i} className="flex flex-col items-center gap-1">
                                  <div className="w-8 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t" style={{ height: `${v * 0.8}px` }} />
                                  <span className="text-[8px] text-gray-500">{['1月','2月','3月','4月','5月','6月'][i]}</span>
                                </div>
                              ))}
                            </div>
                            <p className="text-gray-400 text-[10px] mt-3">GEO 分數從 35 → 78，提升 123%</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Score Tiers */}
      <section className="py-16 bg-gradient-to-b from-gray-900 to-gray-800">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-10">GEO 分數等級說明</h2>
          <div className="grid sm:grid-cols-4 gap-4">
            {[
              { tier: 'Bronze', range: '0-39', color: 'from-amber-700 to-amber-800', desc: '基礎不足，需要全面優化' },
              { tier: 'Silver', range: '40-69', color: 'from-gray-400 to-gray-500', desc: '有基礎，但仍有關鍵指標缺失' },
              { tier: 'Gold', range: '70-89', color: 'from-yellow-500 to-yellow-600', desc: '良好，大部分指標已通過' },
              { tier: 'Platinum', range: '90-100', color: 'from-blue-500 to-indigo-600', desc: '卓越，AI 高度可讀' },
            ].map((t) => (
              <div key={t.tier} className="bg-white/5 rounded-2xl p-5 border border-white/10 text-center">
                <div className={`inline-block px-4 py-1 rounded-full bg-gradient-to-r ${t.color} text-white text-sm font-bold mb-3`}>{t.tier}</div>
                <p className="text-2xl font-bold mb-1">{t.range}</p>
                <p className="text-xs text-gray-400">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-gray-900">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-10">常見問題</h2>
          <div className="space-y-4">
            {faqItems.map((item) => (
              <details key={item.q} className="group bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <summary className="flex items-center justify-between p-6 cursor-pointer list-none hover:bg-white/5 transition-colors">
                  <span className="font-semibold pr-4">{item.q}</span>
                  <ChevronRight className="h-5 w-5 text-gray-500 shrink-0 transition-transform group-open:rotate-90" />
                </summary>
                <div className="px-6 pb-6 text-gray-400 leading-relaxed text-sm">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">準備好了嗎？</h2>
          <p className="mt-4 text-blue-100">從免費掃描開始，3 分鐘看到你的 GEO 分數</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/">
              <Button size="lg" className="bg-white text-gray-900 hover:bg-gray-100 font-semibold h-12 px-8 rounded-xl">
                免費掃描我的網站 <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <Link href="/register">
              <Button size="lg" className="bg-white/10 text-white hover:bg-white/20 font-semibold h-12 px-8 rounded-xl border border-white/20">
                註冊帳號
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-8 border-t border-white/5 bg-gray-950">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-gray-600 text-sm">&copy; {new Date().getFullYear()} Geovault. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
