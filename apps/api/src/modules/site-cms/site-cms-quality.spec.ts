import { evaluateSiteCmsArticle } from './site-cms-quality';

const validArticle = {
  title: '汽車鍍膜前需要先完成哪些漆面清潔步驟',
  slug: 'car-coating-preparation-guide',
  description: '從洗車、去除柏油鐵粉到漆面檢查，整理汽車鍍膜施工前不可省略的準備流程與判斷原則，協助車主降低失敗風險並建立正確保養觀念，也說明不同污染應如何分階段安全處理。',
  content: `## 為什麼施工前清潔重要\n\n${'施工前應先確認車身溫度與髒污類型，再依序沖洗、使用中性洗車精並完整擦乾。'.repeat(25)}\n\n## 去除附著污染的順序\n\n${'柏油、鐵粉與水垢需要分開判斷，依產品標示在通風處操作並避免藥劑乾在漆面上。'.repeat(25)}`,
  category: 'coating',
  tags: ['汽車鍍膜', '漆面清潔'],
  keywords: ['汽車鍍膜前處理', '漆面清潔步驟'],
  coverImageUrl: 'https://cdn.example.com/coating.webp',
  coverAlt: '汽車鍍膜施工前進行漆面清潔與檢查',
  author: 'Mio',
  keyTakeaways: ['先確認漆面溫度與污染種類', '依污染類型分階段處理'],
  faq: [
    { question: '鍍膜前一定要去除鐵粉嗎？', answer: '若漆面有鐵粉附著，應依產品說明安全去除，避免污染被封在保護層下。' },
    { question: '完成清潔後可以立即施工嗎？', answer: '應先確認漆面完全乾燥、無殘留藥劑，並依所用鍍膜產品的施工條件判斷。' },
  ],
  sources: [{ label: '詹大汽車精品官方網站', url: 'https://jimmy-xinhow.github.io/janda-auto/' }],
};

describe('evaluateSiteCmsArticle', () => {
  it('accepts a complete SEO and GEO article', () => {
    const report = evaluateSiteCmsArticle(validArticle);
    expect(report.issues).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('rejects raw active HTML and missing GEO evidence', () => {
    const report = evaluateSiteCmsArticle({
      ...validArticle,
      content: '<script>alert(1)</script> 很短',
      faq: [],
      sources: [],
    });
    expect(report.passed).toBe(false);
    expect(report.checks.safeMarkdown).toBe(false);
    expect(report.checks.faq).toBe(false);
    expect(report.checks.sources).toBe(false);
  });
});
