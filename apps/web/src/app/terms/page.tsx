import { Metadata } from 'next';
import PublicNavbar from '@/components/layout/public-navbar';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.geovault.app';
const CONTACT_EMAIL = 'service@xinhow.com.tw';

export const metadata: Metadata = {
  title: '服務條款',
  description: 'Geovault 服務條款 — 規範您使用本服務之權利義務、付費方案、退款政策與相關法律事項。',
  alternates: { canonical: `${SITE_URL}/terms` },
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

export default function TermsPage() {
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
          服務條款
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
          歡迎使用 Geovault。本服務條款（以下簡稱「本條款」）規範您與 Geovault（以下簡稱「本服務」）之間之權利義務關係。註冊帳號或使用本服務任何功能，即表示您已閱讀、瞭解並同意接受本條款全部內容之拘束。
        </p>

        {/* 01 */}
        <section>
          <SectionHeader num="01" title="服務提供者" />
          <div className="bg-white/5 border border-white/10 border-l-2 border-l-blue-500 rounded-r-lg p-5 space-y-1 text-sm">
            <p><strong className="text-white">服務名稱：</strong>Geovault — Generative Engine Optimization Platform</p>
            <p><strong className="text-white">網站：</strong><a href="https://www.geovault.app" className="text-blue-400 hover:underline">www.geovault.app</a></p>
            <p><strong className="text-white">聯絡信箱：</strong><a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:underline">{CONTACT_EMAIL}</a></p>
          </div>
        </section>

        {/* 02 */}
        <section>
          <SectionHeader num="02" title="服務內容" />
          <p className="text-gray-400 text-sm mb-2">本服務提供以下功能（依您訂閱之方案而異）：</p>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">GEO 掃描：</strong>分析網站 9 項 AI 友善度指標並生成評分報告。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">內容生成：</strong>運用 AI 模型生成 FAQ、文章、品牌敘事等結構化內容。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">AI 引用監控：</strong>追蹤品牌於 ChatGPT、Claude、Perplexity、Gemini、Copilot 等平台之引用狀況。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">爬蟲追蹤：</strong>偵測並記錄 AI 爬蟲對您網站之造訪行為。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">品牌目錄與徽章：</strong>於公開目錄展示已驗證品牌與 GEO 評分徽章。</span></li>
          </ul>
        </section>

        {/* 03 */}
        <section>
          <SectionHeader num="03" title="帳號註冊與使用資格" />
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span>您須年滿 18 歲，或經法定代理人同意，始得註冊使用本服務。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span>註冊資料須真實、正確、完整；如有變動應即時更新。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span>您須妥善保管帳號與密碼，因保管不慎致生之損失由您自負。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span>禁止以單一帳號代多人使用，或將帳號轉讓、出借予第三人。</span></li>
          </ul>
        </section>

        {/* 04 */}
        <section>
          <SectionHeader num="04" title="付費方案與計費" />
          <p className="text-gray-400 text-sm mb-2">本服務採訂閱制，方案規格如下：</p>
          <Table
            headers={['方案', '月費（NTD）', '主要規格']}
            rows={[
              ['Free', '0', '1 個網站、2 次掃描/月、1 次修復體驗'],
              ['Starter', '390', '1 個網站、6 次掃描、30 次修復/內容、10 次 QA、20 次監控、2 份報告'],
              ['Pro', '690', '3 個網站、10 次掃描、50 次修復/內容、15 次 QA、30 次監控、3 份報告、多平台支援、自動排程'],
            ]}
          />
          <ul className="space-y-3 text-sm mt-4">
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">年繳優惠：</strong>年繳享 9 折優惠（相當於 12 個月支付 10.8 個月費用）。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">自動續訂：</strong>訂閱於到期前自動以原方案續扣，您可隨時於帳號設定取消。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">付款方式：</strong>本服務透過藍新金流（NewebPay）受理信用卡付款，Geovault 不儲存信用卡資料。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">配額重設：</strong>各項用量配額於每月扣款日重置，未使用部分不累積至下期。</span></li>
          </ul>
        </section>

        {/* 05 */}
        <section>
          <SectionHeader num="05" title="退款政策" />
          <div className="bg-white/5 border border-white/10 border-l-2 border-l-amber-500 rounded-r-lg p-5 text-sm space-y-2">
            <p><strong className="text-white">本服務屬「依消費者保護法第 19 條第 1 項但書，得排除七日鑑賞期之數位內容服務」。</strong></p>
            <p>由於 GEO 掃描、AI 內容生成、AI 監控等功能於您下單後立即啟用並消耗運算資源，原則上不提供退款。但下列情形我們將個案處理：</p>
            <ul className="space-y-2 mt-2 ml-4">
              <li>· 因本服務系統錯誤導致您完全無法使用所購方案功能。</li>
              <li>· 重複扣款或金額錯誤之情形。</li>
            </ul>
            <p className="mt-3">退款申請請於發生之日起 7 日內來信 <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:underline">{CONTACT_EMAIL}</a>，逾期不予受理。</p>
          </div>
        </section>

        {/* 06 */}
        <section>
          <SectionHeader num="06" title="使用者責任與禁止行為" />
          <p className="text-gray-400 text-sm mb-2">使用本服務時，您承諾不得從事下列行為：</p>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2.5"><span className="text-red-400 font-semibold shrink-0">×</span><span>掃描、提交非您所擁有或無合法授權之網站。</span></li>
            <li className="flex gap-2.5"><span className="text-red-400 font-semibold shrink-0">×</span><span>利用本服務生成違法、侵權、誤導、仇恨、色情或其他不當內容。</span></li>
            <li className="flex gap-2.5"><span className="text-red-400 font-semibold shrink-0">×</span><span>對本服務進行逆向工程、破解、自動化大量請求或其他干擾系統運作之行為。</span></li>
            <li className="flex gap-2.5"><span className="text-red-400 font-semibold shrink-0">×</span><span>透過爬蟲、API 濫用或其他方式繞過方案配額限制。</span></li>
            <li className="flex gap-2.5"><span className="text-red-400 font-semibold shrink-0">×</span><span>冒用他人身份、提交虛假之品牌資訊或成功案例。</span></li>
            <li className="flex gap-2.5"><span className="text-red-400 font-semibold shrink-0">×</span><span>侵害他人智慧財產權、隱私權、名譽權或其他合法權利。</span></li>
          </ul>
          <div className="bg-white/5 border border-white/10 border-l-2 border-l-red-500 rounded-r-lg p-4 mt-4 text-sm">
            違反上述規定者，本服務得不經通知逕行停權、移除違規內容或終止服務，且不予退款；情節重大者並依法追究法律責任。
          </div>
        </section>

        {/* 07 */}
        <section>
          <SectionHeader num="07" title="智慧財產權" />
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">本服務內容：</strong>網站架構、原始碼、Logo、視覺設計、文案、品牌名稱「Geovault」均為本服務所有，受著作權法及商標法保護。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">使用者內容：</strong>您上傳或提交之網站資訊、案例與內容，仍屬您本人所有；惟您授權本服務於提供功能、展示目錄、生成衍生內容、行銷推廣等必要範圍內非專屬、可全球使用、免授權金之利用權利。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">AI 生成內容：</strong>由本服務 AI 模型為您生成之內容（FAQ、文章等），於您完成付款後著作財產權歸屬於您；惟本服務仍保留作為案例展示及模型優化之利用權。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span><strong className="text-white">公開目錄資料：</strong>Geovault 目錄、llms.txt、llms-full.txt 等公開資料採用 <a href="https://creativecommons.org/licenses/by/4.0/" className="text-blue-400 hover:underline" target="_blank" rel="noopener">CC BY 4.0</a> 授權，引用須標註來源 geovault.app。</span></li>
          </ul>
        </section>

        {/* 08 */}
        <section>
          <SectionHeader num="08" title="服務變更與終止" />
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span>本服務得隨時新增、修改、暫停或終止部分或全部功能，如有重大變更將透過電子郵件或服務內公告通知。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span>您得隨時於帳號設定頁面終止服務並刪除帳號；終止後所有關聯資料將透過 Cascade Delete 機制永久刪除。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span>本服務得於您違反本條款時，不經通知逕行終止您之帳號使用權，已支付之訂閱費用不予退還。</span></li>
          </ul>
        </section>

        {/* 09 */}
        <section>
          <SectionHeader num="09" title="第三方服務免責" />
          <p className="text-gray-400 text-sm mb-2">本服務整合下列第三方服務，您使用相關功能時亦受該第三方條款拘束：</p>
          <Table
            headers={['服務', '提供者', '用途']}
            rows={[
              ['AI 內容生成', 'OpenAI', '生成 FAQ、文章、品牌分析'],
              ['AI 引用監控', 'OpenAI、Anthropic、Perplexity、Google、Microsoft', '檢查品牌引用狀況'],
              ['金流處理', '藍新金流（NewebPay）', '信用卡付款'],
              ['電子郵件', 'Resend', '寄送系統通知信'],
              ['資料庫', 'Neon PostgreSQL', '資料儲存'],
              ['主機', 'Railway', '應用程式託管'],
            ]}
          />
          <div className="bg-white/5 border border-white/10 border-l-2 border-l-amber-500 rounded-r-lg p-4 mt-4 text-sm">
            因第三方服務本身故障、政策變動、API 限制等不可歸責於本服務之事由，致功能受影響時，本服務不負損害賠償責任，但會盡力協助通知與恢復。
          </div>
        </section>

        {/* 10 */}
        <section>
          <SectionHeader num="10" title="免責聲明與責任限制" />
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span>本服務之 GEO 評分、AI 生成內容、引用監控結果，係依當下技術條件提供之參考性分析，不保證對搜尋引擎或 AI 平台之實際排名、引用率或商業成效。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span>AI 模型回應具不確定性，本服務不保證 AI 生成內容絕對正確、無偏誤或符合特定產業法規，您應自行審閱並承擔使用風險。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span>於法律允許之最大範圍內，本服務對您之累計損害賠償責任，以您於發生爭議之前 12 個月內實際支付之訂閱費用總額為上限。</span></li>
            <li className="flex gap-2.5"><span className="text-blue-400 font-semibold shrink-0">›</span><span>本服務不對任何間接、附隨、衍生性或懲罰性損害負責，包含但不限於營業損失、商譽損失、資料遺失等。</span></li>
          </ul>
        </section>

        {/* 11 */}
        <section>
          <SectionHeader num="11" title="準據法與管轄" />
          <div className="bg-white/5 border border-white/10 border-l-2 border-l-blue-500 rounded-r-lg p-5 text-sm space-y-2">
            <p>本條款之解釋及適用，以及與本條款有關之爭議，均以中華民國法律為準據法。</p>
            <p>因本條款所生之訴訟，雙方合意以<strong className="text-white">臺灣臺北地方法院</strong>為第一審管轄法院。</p>
          </div>
        </section>

        {/* 12 */}
        <section>
          <SectionHeader num="12" title="條款修訂" />
          <p className="text-gray-400 text-sm leading-relaxed">
            本服務得隨時修訂本條款。重大修訂將於修訂生效前 7 日透過電子郵件或服務內通知告知您。修訂生效後您繼續使用本服務，即視為同意修訂後之條款；如您不同意修訂內容，應於生效前停止使用並終止帳號。
          </p>
        </section>

        {/* 13 */}
        <section>
          <SectionHeader num="13" title="聯絡我們" />
          <p className="text-gray-400 text-sm mb-4">如對本服務條款有任何疑問，歡迎透過以下方式聯繫我們：</p>
          <div className="bg-white/5 border border-blue-500/20 rounded-lg p-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-white font-semibold mb-1">Geovault 客戶服務</p>
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
            您亦可參閱本服務之<a href="/privacy" className="text-blue-400 hover:underline">隱私權政策</a>，瞭解我們如何處理您的個人資料。
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
