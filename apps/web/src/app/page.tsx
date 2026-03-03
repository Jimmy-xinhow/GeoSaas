'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search,
  Wrench,
  Sparkles,
  Share2,
  Check,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const features = [
  {
    icon: Search,
    title: 'AI 診斷引擎',
    description: '8 項核心指標全面掃描，深度分析您的品牌在 AI 搜尋中的可見度。',
  },
  {
    icon: Wrench,
    title: '自動修復工具',
    description: '一鍵生成 JSON-LD 結構化資料和 llms.txt，快速提升 GEO 分數。',
  },
  {
    icon: Sparkles,
    title: 'AI 內容引擎',
    description: '自動生成 FAQ、權威文章和品牌知識庫，讓 AI 更了解您的品牌。',
  },
  {
    icon: Share2,
    title: '多平台佈局',
    description: '同步發布到 Medium、LinkedIn、WordPress 等平台，擴大品牌影響力。',
  },
]

const pricingPlans = [
  {
    name: 'Free',
    price: '$0',
    period: '/月',
    features: ['3 次掃描/月', '1 個網站', '基礎 GEO 報告', '社群支援'],
    cta: '免費開始',
    popular: false,
  },
  {
    name: 'Starter',
    price: '$49',
    period: '/月',
    features: [
      '30 次掃描/月',
      '5 個網站',
      '修復工具',
      '匯出報告',
      'Email 支援',
    ],
    cta: '選擇方案',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$149',
    period: '/月',
    features: [
      '100 次掃描/月',
      '20 個網站',
      'AI 內容引擎',
      'AI 引用監控',
      '多平台發布',
      '優先支援',
    ],
    cta: '選擇方案',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: '$499',
    period: '/月',
    features: [
      '無限量掃描',
      '無限網站',
      'API 存取',
      '白標解決方案',
      '專屬客戶經理',
      '自訂整合',
    ],
    cta: '聯繫我們',
    popular: false,
  },
]

export default function LandingPage() {
  const [scanUrl, setScanUrl] = useState('')
  const router = useRouter()

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <nav className="flex items-center justify-between p-4 px-6 lg:px-12 bg-white/80 backdrop-blur-sm sticky top-0 z-50 border-b border-gray-100">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-gray-900">
            GEO SaaS
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <a
              href="#features"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              功能
            </a>
            <a
              href="#pricing"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              定價
            </a>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              登入
            </Button>
          </Link>
          <Link href="/register">
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              免費開始
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 lg:py-28 text-center bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-6">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            讓 AI 優先推薦
            <br />
            你的品牌
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto">
            全方位 GEO（Generative Engine Optimization）解決方案，
            <br className="hidden sm:block" />
            讓 ChatGPT、Claude、Perplexity 等 AI 工具主動推薦你。
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center gap-3 max-w-xl mx-auto">
            <Input
              placeholder="輸入您的網址，免費掃描..."
              value={scanUrl}
              onChange={(e) => setScanUrl(e.target.value)}
              className="h-12 bg-white/10 border-white/20 text-white placeholder:text-blue-200 backdrop-blur-sm flex-1"
            />
            <Button
              size="lg"
              className="bg-white text-blue-600 hover:bg-blue-50 font-semibold h-12 px-8 shrink-0"
              onClick={() => {
                const params = scanUrl ? `?url=${encodeURIComponent(scanUrl)}` : ''
                router.push(`/register${params}`)
              }}
            >
              免費掃描
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>

          <p className="mt-6 text-sm text-blue-200">
            已有 1,200+ 品牌使用 GEO SaaS 提升 AI 可見度
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              為什麼選擇 GEO SaaS？
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              從診斷到修復，從內容生成到多平台佈局，一站式解決所有 GEO 需求
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-2xl border border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all group"
              >
                <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                  <feature.icon className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              選擇適合的方案
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              從免費方案開始，隨時升級
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  'bg-white rounded-2xl p-6 border-2 transition-shadow hover:shadow-lg relative',
                  plan.popular
                    ? 'border-blue-600 ring-2 ring-blue-600/20'
                    : 'border-gray-100'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      推薦
                    </span>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {plan.name}
                  </h3>
                  <div className="mt-3">
                    <span className="text-4xl font-bold text-gray-900">
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link href="/register" className="w-full">
                  <Button
                    className={cn(
                      'w-full',
                      plan.popular
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : ''
                    )}
                    variant={plan.popular ? 'default' : 'outline'}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold">
            立即開始優化你的品牌 AI 可見度
          </h2>
          <p className="mt-4 text-lg text-blue-100">
            免費開始，無需信用卡。3 分鐘完成首次掃描。
          </p>
          <Link href="/register" className="inline-block mt-8">
            <Button
              size="lg"
              className="bg-white text-blue-600 hover:bg-blue-50 font-semibold h-12 px-10"
            >
              免費開始
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t bg-white">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-gray-500 text-sm">
            &copy; 2024 GEO SaaS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
