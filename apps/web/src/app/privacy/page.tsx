import { Metadata } from 'next';
import Link from 'next/link';
import PublicNavbar from '@/components/layout/public-navbar';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const CONTACT_EMAIL = 'service@xinhow.com.tw';

export const metadata: Metadata = {
  title: '隱私權政策',
  description: 'Geovault 隱私權政策 — 說明我們如何蒐集、使用及保護您的個人資料。',
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: { index: true, follow: true },
};

function SectionHeader({ num, title }: { num: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className="w-7 h-7 rounded flex items-center justify-center text-xs font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 shrink-0">
        {num}
      </span>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden mt-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 border-b border-blue-500/20">
              {headers.map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-mono text-blue-400 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-blue-500/5 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 text-gray-400 leading-relaxed">
                    {j === 0 ? (
                      <span className="inline-block text-xs font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                        {cell}
                      </span>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-300">
      <PublicNavbar />

      {/* Hero */}
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-10 border-b border-white/10">
        <p className="text-xs font-mono text-blue-400 tracking-widest uppercase mb-4 flex items-center gap-2">
          <span className="w-6 h-px bg-blue-400" />
          Legal Document
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight mb-4">
          隱私權政策
        </h1>
        <div className="flex gap-6 flex-wrap text-xs font-mono text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px] shadow-green-400" />
            現行版本
          </span>
          <span>最後更新：2026 年 4 月</span>
          <span>適用範圍：geovault.app</span>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-14">

        <p className="text-gray-400 leading-relaxed">
          歡迎使用 Geovault。本隱私權政策說明我們如何在您使用 <strong className="text-white">geovault.app</strong> 服務時蒐集、使用及保護您的個人資料。使用本服務即表示您同意本政策所述之資料處理方式。
        </p>

        {/* 01 */}
        <section>
          <SectionHeader num="01" title="服務營運者" />
          <div className="bg-white/5 border border-white/10 border-l-2 border-l-blue-500 rounded-r-lg p-5 space-y-1 text-sm">
            <p><strong className="text-white">服務名稱：</strong>Geovault</p>
            <p><strong className="text-white">網站：</strong><a href="https://www.geovault.app" className="text-blue-400 hover:underline">www.geovault.app</a></p>
            <p><strong className="text-white">聯絡信箱：</strong><a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:underline">{CONTACT_EMAIL}</a></p>
          </div>
        </section>

        {/* 02 */}
        <section>
          <SectionHeader num="02" title="蒐集的個人資料" />
          <p className="text-gray-400 text-sm mb-2">我們僅蒐集提供服務所必要的資料，依類型及蒐集時機分類如下：</p>
          <Table
            headers={['資料類別', '蒐集項目', '蒐集時機']}
            rows={[
              ['帳號資料', 'Email、姓名、密碼（bcrypt 雜湊儲存）', '註冊時'],
              ['付款資料', '訂單編號、方案、金額、交易狀態、付款時間', '付款時（信用卡資料由藍新金流處理，Geovault 不儲存卡號）'],
              ['網站資料', '網址、名稱、行業、品牌描述', '用戶新增網站時'],
              ['掃描資料', 'GEO 分數、9 項指標結果、修復建議', '執行掃描時'],
              ['爬蟲追蹤', 'AI 爬蟲名稱、造訪 URL、User-Agent、HTTP 狀態碼', '用戶安裝追蹤碼後'],
              ['訪客掃描', 'IP 雜湊值（SHA-256 前 16 碼）、網址', '免費掃描時（不儲存原始 IP）'],
            ]}
          />
        </section>

        {/* 03 */}
        <section>
          <SectionHeader num="03" title="Cookie 政策" />
          <div className="bg-white/5 border border-white/10 border-l-2 border-l-green-500 rounded-r-lg p-5 text-sm space-y-2">
            <p><strong className="text-white">本服務不使用 Cookie。</strong></p>
            <p>我們採用 JWT Token 進行身份驗證，透過 HTTP Authorization Header 傳遞，不在瀏覽器儲存任何追蹤 Cookie，亦不部署 Google Analytics、Meta Pixel 或任何第三方分析追蹤工具。</p>
          </div>
        </section>

        {/* 04 */}
        <section>
          <SectionHeader num="04" title="第三方服務" />
          <p className="text-gray-400 text-sm mb-2">為提供完整服務功能，我們與下列第三方服務提供商合作：</p>
          <Table
            headers={['服務', '提供者', '用途', '傳送的資料']}
            rows={[
              ['AI 內容生成', 'OpenAI (GPT-4o)', '生成 FAQ、文章、品牌分析', '品牌名稱、行業、關鍵字'],
              ['AI 引用監控', 'OpenAI、Anthropic、Perplexity、Google、Microsoft', '檢查品牌是否被 AI 引用', '搜尋問題、品牌名稱＋網址'],
              ['金流處理', '藍新金流（NewebPay）', '信用卡付款', '訂單金額、Email'],
              ['電子郵件', 'Resend', '寄送通知信', 'Email、姓名'],
              ['搜尋引擎通知', 'IndexNow（Bing、Yandex）', '通知搜尋引擎更新', '頁面 URL'],
              ['資料庫', 'Neon PostgreSQL', '資料儲存', '所有用戶資料（加密傳輸）'],
              ['快取', 'Upstash Redis（TLS）', '暫存資料', '非個人識別資料'],
              ['主機', 'Railway', '應用程式託管', '—'],
            ]}
          />
        </section>

        {/* 05 */}
        <section>
          <SectionHeader num="05" title="資料保留期間" />
          <Table
            headers={['資料類型', '保留期間']}
            rows={[
              ['用戶帳號', '帳號存續期間；刪除帳號時一併刪除所有關聯資料'],
              ['爬蟲造訪記錄', '90 天後自動刪除'],
              ['訪客掃描記錄', '僅儲存 IP 雜湊值，無法反推原始 IP'],
              ['付款記錄', '依相關法規保留'],
            ]}
          />
        </section>

        {/* 06 */}
        <section>
          <SectionHeader num="06" title="您的資料權利" />
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">查閱：</strong>您可在帳號設定頁面隨時查看所有個人資料。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">刪除：</strong>刪除帳號時，所有網站、掃描記錄、內容、訂單及通知均透過 Cascade Delete 機制一併永久刪除。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">匯出：</strong>您可透過 API 匯出網站資料與掃描結果。</span></li>
          </ul>
          <div className="bg-white/5 border border-white/10 border-l-2 border-l-blue-500 rounded-r-lg p-4 mt-4 text-sm">
            如需行使上述權利或有任何疑問，請聯絡 <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:underline">{CONTACT_EMAIL}</a>。
          </div>
        </section>

        {/* 07 */}
        <section>
          <SectionHeader num="07" title="安全措施" />
          <p className="text-gray-400 text-sm mb-4">我們採用多層安全架構保護您的資料：</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { title: '密碼保護', desc: 'bcrypt（10 rounds）雜湊儲存，不以明文保留密碼。' },
              { title: '付款加密', desc: 'AES-256-CBC 加密傳輸，SHA256 簽章驗證。' },
              { title: 'Token 機制', desc: 'JWT 存取令牌 15 分鐘過期，搭配 7 天 Refresh Token 輪替。' },
              { title: '全站 HTTPS', desc: '所有傳輸均透過 TLS 加密，防止中間人攻擊。' },
            ].map((item) => (
              <div key={item.title} className="bg-white/5 border border-white/10 rounded-lg p-4">
                <p className="text-xs font-mono text-blue-400 mb-1.5">{item.title}</p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
            ))}
            <div className="sm:col-span-2 bg-white/5 border border-white/10 rounded-lg p-4">
              <p className="text-xs font-mono text-blue-400 mb-1.5">安全標頭（Middleware）</p>
              <p className="text-xs text-gray-400">部署 X-Frame-Options、X-Content-Type-Options、Referrer-Policy、Permissions-Policy 等標頭，防範常見 Web 攻擊。</p>
            </div>
          </div>
        </section>

        {/* 08 */}
        <section>
          <SectionHeader num="08" title="自動化通知信件" />
          <p className="text-gray-400 text-sm mb-2">以下為服務運作所必要的系統通知，不涉及行銷目的：</p>
          <Table
            headers={['信件類型', '觸發時機']}
            rows={[
              ['歡迎信', '完成帳號註冊時'],
              ['掃描完成通知', 'GEO 掃描完成時'],
              ['徽章獲得通知', '達成成就里程碑時'],
              ['AI 引用變動警報', '品牌引用狀態發生變更時'],
            ]}
          />
        </section>

        {/* 09 */}
        <section>
          <SectionHeader num="09" title="聯絡我們" />
          <p className="text-gray-400 text-sm mb-4">如對本隱私權政策有任何疑問，歡迎透過以下方式聯繫我們：</p>
          <div className="bg-white/5 border border-blue-500/20 rounded-lg p-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-white font-semibold mb-1">Geovault 隱私事務</p>
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm font-mono text-blue-400 hover:underline">{CONTACT_EMAIL}</a>
            </div>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-block text-xs font-mono bg-blue-500 text-black px-5 py-2.5 rounded font-medium hover:opacity-85 transition-opacity"
            >
              發送信件 →
            </a>
          </div>
          <div className="bg-white/5 border border-white/10 border-l-2 border-l-blue-500 rounded-r-lg p-4 mt-4 text-sm">
            本政策如有重大變更，我們將透過電子郵件或服務內通知提前告知。繼續使用服務即表示您接受更新後之政策。
          </div>
        </section>

      </div>

      {/* Footer */}
      <div className="border-t border-white/10 py-8 text-center">
        <p className="text-xs font-mono text-gray-600">
          © {new Date().getFullYear()} Geovault · <a href="https://www.geovault.app" className="text-gray-500 hover:text-blue-400">geovault.app</a> · <a href={`mailto:${CONTACT_EMAIL}`} className="text-gray-500 hover:text-blue-400">{CONTACT_EMAIL}</a>
        </p>
      </div>
    </div>
  );
}
