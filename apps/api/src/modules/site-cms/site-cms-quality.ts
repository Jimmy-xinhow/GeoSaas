import { SITE_CMS_CATEGORIES, SiteCmsFaqDto, SiteCmsSourceDto } from './dto';

export interface SiteCmsQualityInput {
  title?: string | null;
  slug?: string | null;
  description?: string | null;
  content?: string | null;
  contentFormat?: string | null;
  customCss?: string | null;
  category?: string | null;
  tags?: string[] | null;
  keywords?: string[] | null;
  coverImageUrl?: string | null;
  coverAlt?: string | null;
  author?: string | null;
  keyTakeaways?: string[] | null;
  faq?: SiteCmsFaqDto[] | null;
  sources?: SiteCmsSourceDto[] | null;
}

export interface SiteCmsQualityReport {
  passed: boolean;
  score: number;
  issues: string[];
  checks: Record<string, boolean>;
}

const countChars = (value: string | null | undefined) =>
  Array.from(String(value || '').trim()).length;

const inRange = (value: string | null | undefined, min: number, max: number) => {
  const size = countChars(value);
  return size >= min && size <= max;
};

const hasUnsafeContent = (content: string, format: string) => {
  const normalized = content.toLowerCase();
  if (format === 'html') {
    return (
      /<\s*\/?\s*(script|iframe|object|embed|form|style|svg|math|link|meta)\b/i.test(content)
      || /\bon[a-z]+\s*=/i.test(content)
      || /\bstyle\s*=/i.test(content)
      || normalized.includes('javascript:')
      || normalized.includes('data:text/html')
    );
  }
  return (
    /<\s*\/?\s*(script|iframe|object|embed|form|style|svg|math)\b/i.test(content)
    || /\bon[a-z]+\s*=/i.test(content)
    || normalized.includes('javascript:')
    || normalized.includes('data:text/html')
    || /<\s*[a-z][^>]*>/i.test(content)
  );
};

const plainContent = (content: string, format: string) =>
  format === 'html'
    ? content.replace(/<[^>]*>/g, ' ').replace(/&[a-z0-9#]+;/gi, ' ')
    : content;

const publicLeakTerms = [
  'system prompt',
  '忽略先前指令',
  '內部 seo 策略',
  '內部 geo 策略',
  '作為 ai 語言模型',
  'janda-auto.pages.dev',
  'localhost',
  '127.0.0.1',
];

export function evaluateSiteCmsArticle(input: SiteCmsQualityInput): SiteCmsQualityReport {
  const checks: Record<string, boolean> = {};
  const issues: string[] = [];
  const add = (key: string, passed: boolean, issue: string) => {
    checks[key] = passed;
    if (!passed) issues.push(issue);
  };

  add('title', inRange(input.title, 12, 70), '標題需為 12–70 個字。');
  add('slug', /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug || ''), '網址代稱只能使用小寫英文、數字與連字號。');
  add('description', inRange(input.description, 70, 160), 'SEO 描述需為 70–160 個字。');
  add('category', (SITE_CMS_CATEGORIES as readonly string[]).includes(input.category || ''), '請選擇有效文章分類。');
  add('tags', Array.isArray(input.tags) && input.tags.length >= 2 && input.tags.length <= 8, '標籤需有 2–8 個。');
  add('keywords', Array.isArray(input.keywords) && input.keywords.length >= 2 && input.keywords.length <= 10, 'SEO 關鍵字需有 2–10 個。');
  add('coverImage', /^https:\/\//i.test(input.coverImageUrl || ''), '請上傳 HTTPS 首圖。');
  add('coverAlt', inRange(input.coverAlt, 8, 120), '首圖替代文字需為 8–120 個字。');
  add('author', inRange(input.author, 2, 40), '作者名稱需為 2–40 個字。');
  add('takeaways', Array.isArray(input.keyTakeaways) && input.keyTakeaways.length >= 2 && input.keyTakeaways.length <= 5, '重點摘要需有 2–5 點。');
  add('faq', Array.isArray(input.faq) && input.faq.length >= 2 && input.faq.length <= 6, 'GEO 常見問題需有 2–6 組。');
  add('sources', Array.isArray(input.sources) && input.sources.length >= 1 && input.sources.length <= 10, '可信資料來源需有 1–10 筆。');

  const content = String(input.content || '').trim();
  const format = input.contentFormat === 'html' ? 'html' : 'markdown';
  add('contentLength', countChars(plainContent(content, format)) >= 800, '文章正文至少需要 800 個字。');
  const headingCount = format === 'html'
    ? (content.match(/<h2(?:\s[^>]*)?>[\s\S]*?<\/h2>/gi) || []).length
    : (content.match(/^##\s+.+$/gm) || []).length;
  add('headingStructure', headingCount >= 2, '正文至少需要兩個 H2 小標題。');
  add('safeContent', !hasUnsafeContent(content, format), '正文包含不安全的 HTML、事件屬性或可執行網址。');
  add(
    'safeCss',
    !/@|url\s*\(|expression\s*\(|javascript\s*:|position\s*:\s*(fixed|sticky)/i.test(input.customCss || ''),
    '自訂 CSS 包含不允許的外部載入、定位或可執行內容。',
  );
  const normalizedPublicText = `${input.title || ''}\n${input.description || ''}\n${content}`.toLowerCase();
  const leak = publicLeakTerms.find((term) => normalizedPublicText.includes(term.toLowerCase()));
  add('publicSafety', !leak, leak ? `公開內容含禁止字詞：${leak}` : '公開內容安全。');

  if (Array.isArray(input.faq)) {
    input.faq.forEach((item, index) => {
      add(`faq.${index}`, inRange(item.question, 5, 160) && inRange(item.answer, 20, 1000), `FAQ 第 ${index + 1} 組問題或答案長度不符。`);
    });
  }
  if (Array.isArray(input.sources)) {
    input.sources.forEach((item, index) => {
      let valid = false;
      try {
        const parsed = new URL(item.url);
        valid = parsed.protocol === 'https:' && inRange(item.label, 2, 120);
      } catch {
        valid = false;
      }
      add(`source.${index}`, valid, `資料來源第 ${index + 1} 筆必須有名稱與 HTTPS 網址。`);
    });
  }

  const passedCount = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passedCount / Math.max(1, Object.keys(checks).length)) * 100);
  return { passed: issues.length === 0, score, issues, checks };
}
