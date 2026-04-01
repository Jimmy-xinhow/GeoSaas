'use client';

import { BookOpen, Target, CheckCircle2, XCircle, AlertTriangle, Lightbulb, ArrowRight, Star, Zap, Shield } from 'lucide-react';

const goodQueries = [
  { q: '台北中山區推薦整復推拿', why: '具體地區 + 具體服務 = AI 回答精準度高' },
  { q: '板橋染髮推薦哪間', why: '地區 + 服務 + 推薦語氣 = 消費者真實問法' },
  { q: '台中自家烘焙咖啡店推薦', why: '城市 + 特色 + 類型 = 精準定位' },
  { q: '高雄私人健身教練哪間好', why: '城市 + 專業服務 = 競爭者少' },
  { q: '桃園寵物美容推薦', why: '城市 + 服務 = 在地需求' },
  { q: '汽車美容鍍膜推薦品牌', why: '服務 + 推薦 + 品牌 = 直接要品牌名' },
  { q: '整復推拿和物理治療差別', why: '知識型問題 = AI 會引用專業來源' },
  { q: '新手染髮要注意什麼', why: '教育型問題 = 知識庫 Q&A 容易被引用' },
];

const badQueries = [
  { q: '最好的餐廳', why: '太泛，AI 有百萬個選擇' },
  { q: '推薦按摩', why: '沒有地區，AI 不知道推薦哪裡的' },
  { q: '哪裡好玩', why: '跟品牌完全無關' },
  { q: '便宜的美髮', why: '「便宜」不是品牌優勢，AI 不會這樣推薦' },
  { q: '立如整復好不好', why: '直接問品牌名 = 不是自然搜尋，沒代表性' },
];

const categories = [
  {
    name: '推薦型（必放）',
    icon: Star,
    color: 'text-yellow-400 bg-yellow-500/20',
    ratio: '40%',
    description: '消費者最常問 AI 的方式，引用率最高',
    templates: [
      '{城市}{區域}推薦{服務}',
      '{城市}{服務}推薦哪間',
      '{城市}最好的{服務}',
      '推薦{地區}的{行業}店',
      '{服務}推薦品牌',
    ],
    examples: ['台北中山區推薦整復推拿', '台中推薦汽車美容', '板橋最好的美髮'],
  },
  {
    name: '比較型',
    icon: Target,
    color: 'text-blue-400 bg-blue-500/20',
    ratio: '20%',
    description: 'AI 回答比較問題時會列出多個品牌',
    templates: [
      '{服務A}和{服務B}差別',
      '{城市}{行業}哪間比較好',
      '{品牌特色}和{競品特色}怎麼選',
    ],
    examples: ['整復推拿和物理治療差別', '鍍膜和打蠟哪個好', '台北板橋美髮哪間好'],
  },
  {
    name: '知識型',
    icon: BookOpen,
    color: 'text-green-400 bg-green-500/20',
    ratio: '25%',
    description: '教育性問題 AI 會引用專業來源，知識庫 Q&A 容易命中',
    templates: [
      '{服務}要注意什麼',
      '第一次{服務}怎麼準備',
      '{行業}的價格大概多少',
      '怎麼判斷{服務}好不好',
    ],
    examples: ['第一次整復要注意什麼', '汽車鍍膜多久做一次', '染髮前要注意什麼'],
  },
  {
    name: '情境型',
    icon: Lightbulb,
    color: 'text-purple-400 bg-purple-500/20',
    ratio: '15%',
    description: '模擬消費者的真實生活場景',
    templates: [
      '肩頸痠痛該去哪裡',
      '車子刮傷怎麼處理',
      '頭髮毛躁怎麼辦',
      '帶小孩去哪裡放電',
    ],
    examples: ['腰痛該看醫生還是去整復', '新車要先做什麼保養', '頭髮漂過後怎麼修護'],
  },
];

const workflow = [
  { step: 1, title: '了解客戶', desc: '問清楚：品牌名、地區、核心服務、跟競品的差異、目標客群' },
  { step: 2, title: '建知識庫', desc: 'AI 生成 60+ 題 Q&A → 人工審核 → 確保品牌名、地址、服務都正確' },
  { step: 3, title: '設計問題集', desc: '按照 40/20/25/15 比例設計 100 題（見下方策略）' },
  { step: 4, title: '首次掃描 + 修復', desc: '掃描 → AI 修復（JSON-LD + llms.txt + FAQ Schema）→ 再掃確認分數提升' },
  { step: 5, title: '收錄目錄', desc: '加入 Geovault 目錄，設為公開，讓 llms-full.txt 包含客戶資料' },
  { step: 6, title: '等待 7-14 天', desc: 'AI 爬蟲抓取需要時間，這段期間可以持續產出內容' },
  { step: 7, title: '首次驗收', desc: '跑驗收報告（100 題 × 5 平台），分析引用率' },
  { step: 8, title: '優化迭代', desc: '引用率低的問題 → 調整問法或補充知識庫 → 再測' },
];

export default function PlaybookPage() {
  return (
    <div className="max-w-4xl space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-blue-400" />
          客戶操作手冊
        </h1>
        <p className="text-gray-400 mt-1">內部使用 — 如何幫客戶達成 AI 引用目標</p>
      </div>

      {/* SLA */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-blue-400 mb-3">對客戶的承諾</h2>
        <div className="bg-white/5 rounded-xl p-4 text-gray-300 leading-relaxed">
          <p>「我們會幫你建立 100 題品牌知識庫，目標是在 5 大 AI 平台達成 <strong className="text-white">10% 以上的引用率</strong>。如果 30 天內驗收報告顯示引用率低於 5%，我們免費幫你優化到達標為止。」</p>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-white">100 題</p>
            <p className="text-xs text-gray-400">問題集規模</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-400">10%+</p>
            <p className="text-xs text-gray-400">目標引用率</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-yellow-400">30 天</p>
            <p className="text-xs text-gray-400">驗收週期</p>
          </div>
        </div>
      </div>

      {/* Workflow */}
      <div>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-400" />
          標準作業流程
        </h2>
        <div className="space-y-2">
          {workflow.map((w) => (
            <div key={w.step} className="flex items-start gap-3 bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 text-sm font-bold">
                {w.step}
              </div>
              <div>
                <p className="font-semibold text-white">{w.title}</p>
                <p className="text-sm text-gray-400">{w.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Query Strategy */}
      <div>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-400" />
          問題集設計策略（100 題配比）
        </h2>
        <div className="space-y-4">
          {categories.map((cat) => (
            <div key={cat.name} className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cat.color}`}>
                      <cat.icon className="h-4 w-4" />
                    </div>
                    <h3 className="font-bold text-white">{cat.name}</h3>
                  </div>
                  <span className="text-2xl font-bold text-white">{cat.ratio}</span>
                </div>
                <p className="text-sm text-gray-400 mb-4">{cat.description}</p>

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-2 font-semibold">模板</p>
                    <div className="space-y-1">
                      {cat.templates.map((t) => (
                        <div key={t} className="text-sm text-gray-300 bg-white/5 rounded px-2.5 py-1.5 font-mono text-xs">
                          {t}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2 font-semibold">實際範例</p>
                    <div className="space-y-1">
                      {cat.examples.map((e) => (
                        <div key={e} className="text-sm text-green-400 bg-green-500/10 rounded px-2.5 py-1.5">
                          「{e}」
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Good vs Bad */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
            好的問題
          </h2>
          <div className="space-y-2">
            {goodQueries.map((q) => (
              <div key={q.q} className="bg-green-500/5 border border-green-500/20 rounded-xl p-3">
                <p className="text-sm font-medium text-green-400">「{q.q}」</p>
                <p className="text-xs text-gray-500 mt-1">{q.why}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-400" />
            差的問題
          </h2>
          <div className="space-y-2">
            {badQueries.map((q) => (
              <div key={q.q} className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                <p className="text-sm font-medium text-red-400">「{q.q}」</p>
                <p className="text-xs text-gray-500 mt-1">{q.why}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Key Principles */}
      <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          關鍵原則
        </h2>
        <div className="space-y-3">
          {[
            { rule: '問題要像消費者真的會問 AI 的方式', detail: '不要用行銷文案語氣，要用口語。例如「推薦」比「優質」好，「哪間好」比「排名第一」好。' },
            { rule: '一定要帶地區', detail: '在地服務一定要加城市+區域。AI 回答「台北中山區推薦整復」會比「推薦整復」更精準引用在地品牌。' },
            { rule: '知識庫要先於問題集', detail: '知識庫是 AI 學習你品牌的素材，問題集是驗證用的。先建好知識庫，AI 才有東西可以引用。' },
            { rule: '不要只測「品牌名+好不好」', detail: '這種問題 AI 本來就會搜到，不代表自然搜尋時會推薦你。要測的是消費者不知道你的情況下，AI 會不會主動推薦。' },
            { rule: '冷門行業比熱門行業容易', detail: '整復推拿、汽車美容這種利基市場，比餐廳、旅遊更容易被 AI 推薦。選對行業詞很重要。' },
            { rule: '引用率低不是失敗，是優化機會', detail: '看哪些問題沒被引用 → 分析原因 → 補強知識庫 → 再測。通常 2-3 輪迭代後引用率會明顯提升。' },
          ].map((item) => (
            <div key={item.rule} className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-medium text-sm">{item.rule}</p>
                <p className="text-gray-500 text-xs mt-0.5">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing Reference */}
      <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-6">
        <h2 className="text-lg font-bold mb-4">客戶收費參考</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-white font-semibold">一次性優化</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">NT$5,000-10,000</p>
            <p className="text-xs text-gray-400 mt-2">掃描 + 修復 + 知識庫建立 + 首次驗收</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-white font-semibold">每月持續經營</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">NT$3,000-5,000/月</p>
            <p className="text-xs text-gray-400 mt-2">內容更新 + 監控報告 + 問題集優化</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">平台費用 NT$690/月（Pro 方案），毛利 = 顧問費 - 平台費</p>
      </div>
    </div>
  );
}
