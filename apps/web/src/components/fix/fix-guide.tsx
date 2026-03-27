'use client'

import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── Copy button helper ──
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="text-xs">
      {copied ? (
        <><Check className="h-3 w-3 mr-1" /> 已複製</>
      ) : (
        <><Copy className="h-3 w-3 mr-1" /> 複製程式碼</>
      )}
    </Button>
  )
}

// ── Platform tabs ──
type Platform = 'html' | 'wordpress' | 'wix'

function PlatformTabs({
  selected,
  onChange,
}: {
  selected: Platform
  onChange: (p: Platform) => void
}) {
  const tabs: { key: Platform; label: string }[] = [
    { key: 'html', label: '自訂 HTML' },
    { key: 'wordpress', label: 'WordPress' },
    { key: 'wix', label: 'Wix / Squarespace' },
  ]
  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            selected === t.key
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Code block ──
function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="rounded-lg overflow-hidden">
      <div className="flex items-center justify-between bg-gray-800 px-3 py-1.5">
        <span className="text-xs text-gray-400">{language}</span>
        <CopyButton text={code} />
      </div>
      <pre className="bg-gray-900 p-3 overflow-x-auto text-xs leading-relaxed">
        <code className="text-gray-100">{code}</code>
      </pre>
    </div>
  )
}

// ── Step component ──
function Step({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mt-0.5">
        {number}
      </div>
      <div className="flex-1 space-y-2">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <div className="text-sm text-gray-600">{children}</div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════
// Indicator-specific guides
// ══════════════════════════════════════════

interface GuideProps {
  siteName: string
  siteUrl: string
  details?: Record<string, any>
}

// ── Meta Description Guide ──
function MetaDescriptionGuide({ siteName, siteUrl }: GuideProps) {
  const [platform, setPlatform] = useState<Platform>('html')

  const exampleCode = `<meta name="description" content="${siteName} - 提供專業的產品與服務。了解更多關於我們的解決方案，立即聯繫我們獲得協助。">`

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-medium text-blue-900">什麼是 Meta Description？</p>
        <p className="text-sm text-blue-700 mt-1">
          Meta Description 是搜尋引擎和 AI 用來理解您網頁內容的簡短描述。
          它會顯示在 Google 搜尋結果中，也是 AI 判斷是否引用您網站的重要依據。
        </p>
      </div>

      <PlatformTabs selected={platform} onChange={setPlatform} />

      {platform === 'html' && (
        <div className="space-y-4">
          <Step number={1} title="找到您網頁的 HTML 檔案">
            <p>開啟您網站的首頁 HTML 檔案（通常是 <code className="bg-gray-100 px-1 rounded">index.html</code>），找到 <code className="bg-gray-100 px-1 rounded">&lt;head&gt;</code> 區塊。</p>
          </Step>
          <Step number={2} title="複製以下程式碼，貼到 <head> 區塊內">
            <p>請將 content 中的文字改為您網站的實際描述（50-160 字元最佳）：</p>
            <CodeBlock code={exampleCode} language="html" />
          </Step>
          <Step number={3} title="儲存並上傳">
            <p>儲存檔案並上傳到您的伺服器，然後回到 Geovault 重新掃描即可驗證。</p>
          </Step>
        </div>
      )}

      {platform === 'wordpress' && (
        <div className="space-y-4">
          <Step number={1} title="安裝 SEO 外掛">
            <p>前往 WordPress 後台 → 外掛 → 安裝新外掛，搜尋並安裝 <strong>Yoast SEO</strong> 或 <strong>Rank Math</strong>。</p>
          </Step>
          <Step number={2} title="編輯頁面的 SEO 設定">
            <p>開啟您要修改的頁面 → 拉到頁面下方 → 找到 SEO 外掛區塊 → 在「Meta Description」欄位填入描述文字。</p>
          </Step>
          <Step number={3} title="發布頁面">
            <p>點擊「更新」儲存頁面，然後回到 Geovault 重新掃描即可。</p>
          </Step>
        </div>
      )}

      {platform === 'wix' && (
        <div className="space-y-4">
          <Step number={1} title="開啟 SEO 設定">
            <p>登入 Wix 編輯器 → 點擊要編輯的頁面 → 右上角選單 → <strong>SEO (Google)</strong>。</p>
          </Step>
          <Step number={2} title="填入描述">
            <p>在「What does this page is about?」欄位中填入您的頁面描述（50-160 字元）。</p>
          </Step>
          <Step number={3} title="發布網站">
            <p>點擊「發布」，然後回到 Geovault 重新掃描即可。</p>
          </Step>
        </div>
      )}
    </div>
  )
}

// ── Title Optimization Guide ──
function TitleOptimizationGuide({ siteName, siteUrl, details }: GuideProps) {
  const [platform, setPlatform] = useState<Platform>('html')
  const currentTitle = details?.title || ''

  const exampleCode = `<title>${siteName} | 您的核心關鍵字描述</title>`

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-medium text-blue-900">什麼是頁面標題？</p>
        <p className="text-sm text-blue-700 mt-1">
          頁面標題（Title）是瀏覽器分頁上顯示的文字，也是搜尋結果中最醒目的藍色連結。
          AI 判斷您的網站主題時，標題是最重要的參考依據。
        </p>
      </div>

      {currentTitle && (
        <div className="p-3 bg-gray-50 border rounded-lg">
          <p className="text-xs text-gray-500">您目前的標題：</p>
          <p className="text-sm font-medium mt-1">{currentTitle}</p>
        </div>
      )}

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <p className="font-medium">最佳標題格式：</p>
        <p className="mt-1"><code className="bg-amber-100 px-1 rounded">品牌名 | 關鍵字描述</code>（30-60 字元）</p>
        <p className="mt-1">例如：<code className="bg-amber-100 px-1 rounded">{siteName} | 台灣領先的 SEO 優化平台</code></p>
      </div>

      <PlatformTabs selected={platform} onChange={setPlatform} />

      {platform === 'html' && (
        <div className="space-y-4">
          <Step number={1} title="開啟 HTML 檔案">
            <p>開啟您網站的首頁 HTML 檔案，找到 <code className="bg-gray-100 px-1 rounded">&lt;head&gt;</code> 區塊中的 <code className="bg-gray-100 px-1 rounded">&lt;title&gt;</code> 標籤。</p>
          </Step>
          <Step number={2} title="修改標題內容">
            <CodeBlock code={exampleCode} language="html" />
          </Step>
          <Step number={3} title="儲存並上傳">
            <p>儲存檔案並上傳，然後重新掃描驗證。</p>
          </Step>
        </div>
      )}

      {platform === 'wordpress' && (
        <div className="space-y-4">
          <Step number={1} title="使用 SEO 外掛修改">
            <p>前往 WordPress 後台 → 開啟要修改的頁面 → 找到 Yoast SEO 或 Rank Math 區塊 → 修改「SEO Title」欄位。</p>
          </Step>
          <Step number={2} title="點擊更新">
            <p>儲存頁面後重新掃描即可。</p>
          </Step>
        </div>
      )}

      {platform === 'wix' && (
        <div className="space-y-4">
          <Step number={1} title="開啟頁面設定">
            <p>Wix 編輯器 → 點擊頁面 → 右上角選單 → <strong>SEO (Google)</strong> → 修改頁面標題。</p>
          </Step>
          <Step number={2} title="發布">
            <p>發布網站後重新掃描即可。</p>
          </Step>
        </div>
      )}
    </div>
  )
}

// ── Contact Info Guide ──
function ContactInfoGuide({ siteName, siteUrl, details }: GuideProps) {
  const missing: string[] = []
  if (!details?.hasEmail) missing.push('Email')
  if (!details?.hasPhone) missing.push('電話')
  if (!details?.hasAddress) missing.push('地址')
  if (!details?.hasContactSchema) missing.push('ContactPoint Schema')

  const schemaCode = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "${siteName}",
  "url": "${siteUrl}",
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+886-2-1234-5678",
    "email": "contact@example.com",
    "contactType": "customer service",
    "availableLanguage": "Chinese"
  },
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "信義路五段7號",
    "addressLocality": "台北市",
    "addressRegion": "信義區",
    "postalCode": "110",
    "addressCountry": "TW"
  }
}
</script>`

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-medium text-blue-900">為什麼需要聯絡資訊？</p>
        <p className="text-sm text-blue-700 mt-1">
          AI 在引用或推薦品牌時，會優先選擇有完整聯絡資訊的網站。
          提供 email、電話和地址可以大幅提升您被 AI 引用的機率。
        </p>
      </div>

      {missing.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <p className="font-medium">缺少以下資訊：</p>
          <ul className="list-disc list-inside mt-1 space-y-0.5">
            {missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}

      <Step number={1} title="在網頁中加入聯絡資訊">
        <p>確保您的網頁上可以看到 email、電話號碼和地址。可以放在頁尾（footer）或聯絡我們頁面。</p>
      </Step>

      <Step number={2} title="加入 ContactPoint Schema（讓 AI 更容易讀取）">
        <p>將以下程式碼複製並貼到您網頁的 <code className="bg-gray-100 px-1 rounded">&lt;head&gt;</code> 區塊中，並將範例資料改為您的實際資訊：</p>
        <CodeBlock code={schemaCode} language="html" />
      </Step>

      <Step number={3} title="儲存並重新掃描">
        <p>儲存修改後，回到 Geovault 重新掃描即可驗證。</p>
      </Step>
    </div>
  )
}

// ── Image Alt Guide ──
function ImageAltGuide({ siteName, siteUrl, details }: GuideProps) {
  const total = details?.totalImages ?? 0
  const missing = details?.withoutAlt ?? 0
  const missingSrcs: string[] = details?.missingAltSrcs ?? []

  const exampleCode = `<!-- 修改前（缺少 alt） -->
<img src="product.jpg">

<!-- 修改後（加入描述性 alt） -->
<img src="product.jpg" alt="${siteName} 的主打產品 - 簡短描述產品內容">`

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-medium text-blue-900">什麼是圖片 Alt 文字？</p>
        <p className="text-sm text-blue-700 mt-1">
          Alt 文字是用來描述圖片內容的替代文字。AI 無法直接看到圖片，
          必須依賴 Alt 文字來理解圖片代表的意義。缺少 Alt 文字會讓 AI 忽略您的圖片內容。
        </p>
      </div>

      {missing > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <p className="font-medium">共 {total} 張圖片中，有 {missing} 張缺少 Alt 文字</p>
          {missingSrcs.length > 0 && (
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-xs break-all">
              {missingSrcs.map((src, i) => <li key={i}>{src}</li>)}
            </ul>
          )}
        </div>
      )}

      <Step number={1} title="找到缺少 Alt 的圖片">
        <p>在您的 HTML 中，搜尋所有 <code className="bg-gray-100 px-1 rounded">&lt;img&gt;</code> 標籤，找到沒有 <code className="bg-gray-100 px-1 rounded">alt</code> 屬性的圖片。</p>
      </Step>

      <Step number={2} title="為每張圖片加入描述性的 Alt 文字">
        <p>Alt 文字應簡短描述圖片內容（5-15 個字），不要堆砌關鍵字：</p>
        <CodeBlock code={exampleCode} language="html" />
      </Step>

      <Step number={3} title="WordPress 使用者">
        <p>編輯文章 → 點擊圖片 → 右側面板「替代文字」欄位填入描述即可，不需修改程式碼。</p>
      </Step>

      <Step number={4} title="儲存並重新掃描">
        <p>修改完成後，回到 Geovault 重新掃描來驗證修復效果。</p>
      </Step>
    </div>
  )
}

// ── JSON-LD Guide (for already auto-fixable indicators) ──
function JsonLdGuide({ siteName, siteUrl }: GuideProps) {
  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-medium text-blue-900">什麼是 JSON-LD 結構化資料？</p>
        <p className="text-sm text-blue-700 mt-1">
          JSON-LD 是一種讓 AI 和搜尋引擎快速理解您網站身份的標準格式。
          它就像您網站的「名片」，告訴 AI 您是誰、做什麼、在哪裡。
        </p>
      </div>
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
        <p>此指標支援一鍵生成！點擊上方「生成修復程式碼」按鈕，系統會自動為您的網站產生 JSON-LD。生成後複製程式碼，貼到您網頁的 <code className="bg-green-100 px-1 rounded">&lt;head&gt;</code> 區塊中即可。</p>
      </div>
    </div>
  )
}

function LlmsTxtGuide({ siteName, siteUrl }: GuideProps) {
  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-medium text-blue-900">什麼是 llms.txt？</p>
        <p className="text-sm text-blue-700 mt-1">
          llms.txt 就像 robots.txt 的 AI 版本。它是一個放在網站根目錄的純文字檔案，
          告訴 AI 爬蟲您的網站重點內容在哪裡、應該如何理解您的品牌。
        </p>
      </div>
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
        <p>此指標支援一鍵生成！點擊「生成修復程式碼」按鈕後，將產生的內容儲存為 <code className="bg-green-100 px-1 rounded">llms.txt</code> 檔案，放到您網站的根目錄（跟 index.html 同一層）。</p>
      </div>
    </div>
  )
}

function OgTagsGuide({ siteName, siteUrl }: GuideProps) {
  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-medium text-blue-900">什麼是 Open Graph 標籤？</p>
        <p className="text-sm text-blue-700 mt-1">
          Open Graph 標籤決定了您的網頁在 Facebook、LINE、Twitter 等平台分享時的顯示方式。
          AI 也會參考這些標籤來理解您的網頁主題和縮圖。
        </p>
      </div>
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
        <p>此指標支援一鍵生成！點擊「生成修復程式碼」按鈕後，複製產生的 meta 標籤，貼到您網頁的 <code className="bg-green-100 px-1 rounded">&lt;head&gt;</code> 區塊中。</p>
      </div>
    </div>
  )
}

function FaqSchemaGuide({ siteName, siteUrl }: GuideProps) {
  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-medium text-blue-900">什麼是 FAQ Schema？</p>
        <p className="text-sm text-blue-700 mt-1">
          FAQ Schema 是一種結構化資料，讓 AI 能直接讀取您網站的常見問答。
          當用戶向 ChatGPT 或 Google 提問時，有 FAQ Schema 的網站被引用的機率會大幅提升。
        </p>
      </div>
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
        <p>此指標支援一鍵生成！點擊「生成修復程式碼」按鈕，系統會產生 FAQ 結構化資料。生成後複製貼到 <code className="bg-green-100 px-1 rounded">&lt;head&gt;</code> 區塊中。建議至少準備 5 組常見問答以獲得最佳效果。</p>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════
// Main export
// ══════════════════════════════════════════

const guideComponents: Record<string, React.FC<GuideProps>> = {
  'json-ld': JsonLdGuide,
  'llms-txt': LlmsTxtGuide,
  'og-tags': OgTagsGuide,
  'faq-schema': FaqSchemaGuide,
  'meta-description': MetaDescriptionGuide,
  'meta_description': MetaDescriptionGuide,
  'title-optimization': TitleOptimizationGuide,
  'title_optimization': TitleOptimizationGuide,
  'contact-info': ContactInfoGuide,
  'contact_info': ContactInfoGuide,
  'image-alt': ImageAltGuide,
  'image_alt': ImageAltGuide,
}

export function FixGuide({
  indicator,
  siteName,
  siteUrl,
  details,
}: {
  indicator: string
  siteName: string
  siteUrl: string
  details?: Record<string, any>
}) {
  const GuideComponent = guideComponents[indicator]
  if (!GuideComponent) return null
  return <GuideComponent siteName={siteName} siteUrl={siteUrl} details={details} />
}
