'use client'

import Link from 'next/link'
import {
  Search, Wrench, Sparkles, Eye, BookOpen, FileText,
  ArrowRight, CheckCircle2, ChevronRight, Globe,
  BarChart3, Share2, ClipboardCheck, Zap, Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import PublicNavbar from '@/components/layout/public-navbar'
import { GeovaultLogoCompactDark } from '@/components/logo'

const steps = [
  {
    step: 1,
    title: '免費掃描你的網站',
    icon: Search,
    color: 'blue',
    description: '在首頁輸入你的網址，系統會自動檢測 9 項 AI 可讀性指標，產出你的 GEO 分數。',
    details: [
      '前往首頁，在掃描框輸入你的網站網址',
      '系統自動檢測：JSON-LD、llms.txt、FAQ Schema、OG Tags、Meta Description、標題優化、聯絡資訊、圖片 Alt、robots.txt AI 政策',
      '30 秒內取得 GEO 分數（0-100 分）和各指標狀態',
      '免費帳號每月可掃描 2 次',
    ],
    tip: '第一次掃描不需要註冊！直接在首頁輸入網址就能免費體驗。',
  },
  {
    step: 2,
    title: '註冊帳號，加入你的網站',
    icon: Globe,
    color: 'purple',
    description: '建立帳號後，在「我的網站」加入你要優化的網站，開始追蹤 GEO 分數變化。',
    details: [
      '點擊「免費開始」註冊帳號（Email + 密碼）',
      '登入後進入 Dashboard，點擊「我的網站」',
      '點擊「新增網站」，輸入網址和網站名稱',
      '系統會自動執行首次掃描',
    ],
    tip: 'Free 方案可以管理 1 個網站，Pro 方案最多 3 個。',
  },
  {
    step: 3,
    title: 'AI 自動修復',
    icon: Wrench,
    color: 'green',
    description: '針對掃描結果中缺失的指標，AI 會自動生成修復程式碼，你只需要複製貼上。',
    details: [
      '進入網站詳情頁，點擊「AI 修復」',
      '系統根據你的品牌資料，自動生成 JSON-LD 結構化資料',
      '一鍵生成 llms.txt（讓 AI 爬蟲讀取你的品牌資訊）',
      '生成 FAQ Schema（讓 AI 可以引用你的 Q&A）',
      '將生成的程式碼複製到你的網站 HTML 中',
    ],
    tip: '不懂程式碼也沒關係！系統會生成完整的程式碼片段，你只需要貼到網站的 <head> 標籤裡。如果用 WordPress，可以使用「自訂 HTML」小工具。',
  },
  {
    step: 4,
    title: '建立品牌知識庫',
    icon: BookOpen,
    color: 'orange',
    description: 'AI 自動生成 60+ 題品牌 Q&A，讓 ChatGPT、Claude 等 AI 真正「認識」你的品牌。',
    details: [
      '進入網站詳情頁，點擊「知識庫」',
      '點擊「AI 生成知識庫」，系統自動分析你的網站',
      'AI 會生成 5 大分類的 Q&A：品牌核心、產業知識、產品服務、消費者疑慮、教育延伸',
      '每次生成約 60 題，可以多次生成來補充',
      '所有 Q&A 會自動出現在你的 llms-full.txt 中，供 AI 爬蟲抓取',
    ],
    tip: '知識庫越豐富，AI 越容易「認識」你。建議至少生成 2-3 次，累積 100+ 題以上效果最好。',
  },
  {
    step: 5,
    title: 'AI 內容生成',
    icon: Sparkles,
    color: 'cyan',
    description: '自動生成 FAQ 文章、品牌分析報告、行業報告，持續餵養 AI 搜尋引擎。',
    details: [
      '進入「內容引擎」頁面',
      '選擇內容類型：FAQ、文章、知識庫、新聞稿',
      'AI 根據你的品牌資料和掃描結果自動撰寫',
      '生成的內容可以直接發佈到你的網站或社群平台',
    ],
    tip: '定期產出新內容可以保持 AI 對你品牌的「記憶」。建議每月至少生成 2-3 篇新內容。',
  },
  {
    step: 6,
    title: '再次掃描，確認分數提升',
    icon: BarChart3,
    color: 'blue',
    description: '完成修復和內容建立後，重新掃描確認 GEO 分數是否提升。',
    details: [
      '回到「我的網站」，點擊「掃描」',
      '比較修復前後的分數變化',
      'Dashboard 上可以看到歷史分數趨勢圖',
      '目標：將分數提升到 70 分以上（Silver 等級以上）',
    ],
    tip: '修復 JSON-LD 和 llms.txt 通常可以讓分數提升 20-40 分。',
  },
  {
    step: 7,
    title: 'AI 引用監控（Pro）',
    icon: Eye,
    color: 'green',
    description: '輸入消費者可能問 AI 的問題，即時檢查 5 大 AI 平台是否正在推薦你。',
    details: [
      '進入「AI 監控」頁面',
      '輸入問題，例如：「台北推薦整復推拿」「最好的汽車美容品牌」',
      '系統自動查詢 ChatGPT、Claude、Perplexity、Gemini、Copilot',
      '即時顯示每個平台是否有提到你的品牌',
      '也可以一鍵跑「驗收報告」，從知識庫選題批量測試並產出 PDF',
    ],
    tip: '建議用不同的問法測試，例如「推薦」「最好的」「哪裡有」等不同說法，看哪些問法 AI 會推薦你。',
  },
  {
    step: 8,
    title: '多平台發佈（Pro）',
    icon: Share2,
    color: 'purple',
    description: '將生成的內容同步發佈到 Medium、LinkedIn、WordPress 等平台，擴大品牌曝光。',
    details: [
      '進入「多平台佈局」頁面',
      '連接你的 Medium、LinkedIn、WordPress 帳號',
      '選擇要發佈的內容，一鍵同步到多個平台',
      '越多平台有你的品牌資訊，AI 越容易找到你',
    ],
    tip: '外部平台的內容也會被 AI 爬蟲抓取，越多地方提到你的品牌，AI 推薦你的機率越高。',
  },
]

const faqItems = [
  {
    q: '修復程式碼要貼在哪裡？',
    a: 'JSON-LD 和 FAQ Schema 要貼在你網站 HTML 的 <head> 標籤內。如果用 WordPress，到「外觀 > 小工具」或安裝 Insert Headers and Footers 外掛。Webflow 可以在 Custom Code 區域貼上。Squarespace 到「Settings > Advanced > Code Injection」。',
  },
  {
    q: 'llms.txt 要放在哪裡？',
    a: 'llms.txt 需要放在你網站的根目錄，讓 AI 爬蟲可以透過 yourdomain.com/llms.txt 存取。如果你使用 Geovault 的 llms.txt 託管功能，系統會自動幫你生成並託管，不需要自己設定。',
  },
  {
    q: '優化後多久才能被 AI 推薦？',
    a: '通常完成基礎優化（JSON-LD + llms.txt + 知識庫）後，7-14 天內就能在部分 AI 平台看到改善。完整效果可能需要 1-2 個月，取決於你的行業競爭程度和內容豐富度。',
  },
  {
    q: '我有多個分店/品牌，怎麼管理？',
    a: 'Pro 方案支援 3 個網站。每個網站獨立掃描、獨立修復、獨立監控。如果你有更多網站需求，可以聯繫我們討論客製方案。',
  },
  {
    q: '掃描結果的指標是什麼意思？',
    a: '9 項指標分別是：JSON-LD（結構化資料）、llms.txt（AI 爬蟲可讀檔）、OG Tags（社群分享預覽）、Meta Description（頁面描述）、FAQ Schema（問答結構化資料）、標題優化（H1 標籤）、聯絡資訊（地址/電話）、圖片 Alt（圖片說明文字）、robots.txt AI 政策（是否允許 AI 爬蟲）。',
  },
  {
    q: 'GEO 和 SEO 需要分開做嗎？',
    a: '不需要。GEO 和 SEO 很多工作是重疊的（如結構化資料、Meta Description），做 GEO 優化的同時也會提升 SEO。兩者可以並行。',
  },
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
        <div className="max-w-4xl mx-auto px-6">
          <div className="space-y-8">
            {steps.map((item, index) => {
              const colorMap: Record<string, { badge: string; icon: string; border: string; tipBg: string; tipText: string }> = {
                blue: { badge: 'bg-blue-500/20 text-blue-400', icon: 'bg-blue-600', border: 'border-blue-500/30', tipBg: 'bg-blue-500/10 border-blue-500/20', tipText: 'text-blue-300' },
                purple: { badge: 'bg-purple-500/20 text-purple-400', icon: 'bg-purple-600', border: 'border-purple-500/30', tipBg: 'bg-purple-500/10 border-purple-500/20', tipText: 'text-purple-300' },
                green: { badge: 'bg-green-500/20 text-green-400', icon: 'bg-green-600', border: 'border-green-500/30', tipBg: 'bg-green-500/10 border-green-500/20', tipText: 'text-green-300' },
                orange: { badge: 'bg-orange-500/20 text-orange-400', icon: 'bg-orange-600', border: 'border-orange-500/30', tipBg: 'bg-orange-500/10 border-orange-500/20', tipText: 'text-orange-300' },
                cyan: { badge: 'bg-cyan-500/20 text-cyan-400', icon: 'bg-cyan-600', border: 'border-cyan-500/30', tipBg: 'bg-cyan-500/10 border-cyan-500/20', tipText: 'text-cyan-300' },
              }
              const c = colorMap[item.color]
              const isPro = item.title.includes('Pro')

              return (
                <div key={item.step} className={`bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 hover:${c.border} transition-all`}>
                  {/* Header */}
                  <div className="flex items-start gap-4 mb-6">
                    <div className={`w-12 h-12 rounded-2xl ${c.icon} text-white flex items-center justify-center shrink-0 shadow-lg`}>
                      <item.icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
                          Step {item.step}
                        </span>
                        {isPro && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                            Pro
                          </span>
                        )}
                      </div>
                      <h2 className="text-xl font-bold">{item.title}</h2>
                    </div>
                  </div>

                  <p className="text-gray-400 mb-5">{item.description}</p>

                  {/* Steps list */}
                  <div className="space-y-3 mb-5">
                    {item.details.map((detail, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                        <span className="text-gray-300 text-sm">{detail}</span>
                      </div>
                    ))}
                  </div>

                  {/* Tip */}
                  <div className={`rounded-xl p-4 border ${c.tipBg}`}>
                    <p className={`text-sm ${c.tipText}`}>
                      <strong>Tip：</strong>{item.tip}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Quick Reference: Score Tiers */}
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
                <div className={`inline-block px-4 py-1 rounded-full bg-gradient-to-r ${t.color} text-white text-sm font-bold mb-3`}>
                  {t.tier}
                </div>
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
                <div className="px-6 pb-6 text-gray-400 leading-relaxed text-sm">
                  {item.a}
                </div>
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
                免費掃描我的網站
                <ArrowRight className="h-4 w-4 ml-2" />
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

      {/* Footer */}
      <footer className="py-8 border-t border-white/5 bg-gray-950">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-gray-600 text-sm">
            &copy; {new Date().getFullYear()} Geovault. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
