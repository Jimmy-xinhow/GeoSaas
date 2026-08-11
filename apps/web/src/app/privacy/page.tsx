import type { Metadata } from 'next';
import PublicFooter from '@/components/layout/public-footer';
import PublicNavbar from '@/components/layout/public-navbar';
import EmailLink from '@/components/shared/email-link';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';

export const metadata: Metadata = {
  title: '隱私權政策',
  description: 'GeoVault 隱私權政策：說明我們蒐集的資料、使用目的、第三方服務、保存期限與您的權利。',
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: { index: true, follow: true },
};

const sections = [
  {
    title: '我們蒐集哪些資料',
    body: '當您註冊、建立網站、執行 GEO 掃描或聯絡客服時，我們可能處理帳號資料、網站 URL、掃描結果、您主動提供的內容、訂閱與交易紀錄，以及維持服務安全所需的技術日誌。密碼只保存不可逆的雜湊值。',
  },
  {
    title: '分析 Cookie 與同意',
    body: 'Google Analytics 4 只有在您點選「同意分析」後才會載入。我們用它了解頁面瀏覽、內容互動與服務流程是否順暢；廣告儲存、廣告個人化與跨站行銷追蹤預設且持續停用。您拒絕分析不會影響功能，並可透過頁面左下角的「隱私設定」隨時撤回或變更。您的選擇會保存在瀏覽器 localStorage。',
  },
  {
    title: '資料用途',
    body: '資料用於提供帳號與掃描服務、產生您要求的內容、改善產品品質、偵測濫用與安全事件、處理付款、回覆客服，以及在取得同意後分析整體使用成效。我們不出售個人資料。',
  },
  {
    title: '第三方服務',
    body: '為了提供服務，我們可能使用雲端主機與資料庫、郵件寄送、付款、AI 模型供應商、Google 登入與 Google Analytics 4。只會傳送完成特定功能所必要的資料，並依各服務供應商的條款與安全措施處理。',
  },
  {
    title: '保存與安全',
    body: '資料只在提供服務、履行法定義務與處理爭議所需期間保存。我們採用 HTTPS、權限控管、短效存取權杖與資料庫存取限制。沒有任何系統能保證絕對安全；若發生依法應通知的事件，我們會依適用規定處理。',
  },
  {
    title: '您的權利',
    body: '您可要求查詢、更正、刪除或限制處理與您相關的資料，也可撤回分析同意。部分紀錄可能因法令、付款或防詐需求而需保留一段時間。',
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300">
      <PublicNavbar />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-blue-400">Legal document</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">隱私權政策</h1>
        <p className="mt-4 text-sm text-gray-500">最後更新：2026 年 8 月 11 日</p>
        <p className="mt-8 leading-7 text-gray-400">
          本政策適用於 GeoVault（www.geovault.app）及其相關服務，說明我們如何處理資料與尊重您的選擇。
        </p>

        <div className="mt-12 space-y-10">
          {sections.map((section, index) => (
            <section key={section.title}>
              <div className="flex items-center gap-3">
                <span className="rounded border border-blue-500/25 bg-blue-500/10 px-2 py-1 font-mono text-xs text-blue-300">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h2 className="text-xl font-semibold text-white">{section.title}</h2>
              </div>
              <p className="mt-4 leading-7 text-gray-400">{section.body}</p>
            </section>
          ))}

          <section className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold text-white">聯絡我們</h2>
            <p className="mt-3 leading-7 text-gray-400">
              若要行使資料權利或詢問本政策，請寄信至 <EmailLink className="text-blue-300 hover:text-blue-200" />。
            </p>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
