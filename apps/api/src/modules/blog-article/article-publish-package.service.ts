import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertSiteAccess } from '../../common/auth/site-access';
import { BlogArticleService } from './blog-article.service';

type ClientDailyDayType =
  | 'mon_topical'
  | 'tue_qa_deepdive'
  | 'wed_service'
  | 'thu_audience'
  | 'fri_comparison'
  | 'sat_data_pulse';

interface PublishPackageArticle {
  slug: string;
  title: string;
  description: string;
  content: string;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
  targetKeywords: string[];
  site: {
    id: string;
    name: string;
    url: string;
    industry: string | null;
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/**
 * Portable, dependency-free conversion for CMS copy/paste.
 * Raw HTML is escaped first so generated article content cannot inject scripts
 * into a customer's site through the publishing package.
 */
export function markdownToPortableHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const output: string[] = ['<article>'];
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCode = false;
  let codeLanguage = '';
  let codeLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = null;
  };
  const openList = (type: 'ul' | 'ol') => {
    if (listType === type) return;
    closeList();
    output.push(`<${type}>`);
    listType = type;
  };

  for (const line of lines) {
    const fence = line.match(/^```\s*([\w-]*)\s*$/);
    if (fence) {
      flushParagraph();
      closeList();
      if (!inCode) {
        inCode = true;
        codeLanguage = fence[1] || '';
        codeLines = [];
      } else {
        const languageClass = codeLanguage
          ? ` class="language-${escapeHtml(codeLanguage)}"`
          : '';
        output.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        inCode = false;
        codeLanguage = '';
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${inlineMarkdown(heading[2].trim())}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      openList('ul');
      output.push(`<li>${inlineMarkdown(unordered[1].trim())}</li>`);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      openList('ol');
      output.push(`<li>${inlineMarkdown(ordered[1].trim())}</li>`);
      continue;
    }

    const quote = line.match(/^>\s*(.+)$/);
    if (quote) {
      flushParagraph();
      closeList();
      output.push(`<blockquote>${inlineMarkdown(quote[1].trim())}</blockquote>`);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      closeList();
      output.push('<hr>');
      continue;
    }

    closeList();
    paragraph.push(line.trim());
  }

  if (inCode) {
    const languageClass = codeLanguage
      ? ` class="language-${escapeHtml(codeLanguage)}"`
      : '';
    output.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  flushParagraph();
  closeList();
  output.push('</article>');
  return output.join('\n');
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFaqs(markdown: string): Array<{ question: string; answer: string }> {
  const faqs: Array<{ question: string; answer: string }> = [];
  const regex = /\*\*Q[:：]\s*(.+?)\*\*\s*\n+A[:：]\s*([\s\S]*?)(?=\n\s*\*\*Q[:：]|\n#{1,4}\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const question = stripMarkdown(match[1]);
    const answer = stripMarkdown(match[2]);
    if (question && answer) faqs.push({ question, answer });
  }
  return faqs.slice(0, 10);
}

function normalizeOfficialUrl(siteUrl: string, slug: string, requested?: string): string {
  let official: URL;
  try {
    official = new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`);
  } catch {
    throw new BadRequestException('Site official URL is invalid');
  }

  const suggested = new URL(`/blog/${slug}`, official.origin);
  if (!requested?.trim()) return suggested.toString();

  let candidate: URL;
  try {
    candidate = new URL(requested.trim());
  } catch {
    throw new BadRequestException('canonicalUrl must be a valid absolute URL');
  }
  if (!['http:', 'https:'].includes(candidate.protocol)) {
    throw new BadRequestException('canonicalUrl must use http or https');
  }

  const officialHost = official.hostname.toLowerCase().replace(/^www\./, '');
  const candidateHost = candidate.hostname.toLowerCase().replace(/^www\./, '');
  const sameOfficialDomain =
    candidateHost === officialHost || candidateHost.endsWith(`.${officialHost}`);
  if (!sameOfficialDomain) {
    throw new BadRequestException('canonicalUrl must use the customer official domain');
  }
  candidate.hash = '';
  return candidate.toString();
}

export function buildManualPublishPackage(
  article: PublishPackageArticle,
  requestedCanonicalUrl?: string,
) {
  const canonicalUrl = normalizeOfficialUrl(
    article.site.url,
    article.slug,
    requestedCanonicalUrl,
  );
  const dayType = article.targetKeywords.find((keyword) =>
    [
      'mon_topical',
      'tue_qa_deepdive',
      'wed_service',
      'thu_audience',
      'fri_comparison',
      'sat_data_pulse',
    ].includes(keyword),
  ) as ClientDailyDayType | undefined;
  const reviewIntervalDays = dayType === 'sat_data_pulse' ? 7 : 30;
  const nextReviewAt = new Date(article.updatedAt);
  nextReviewAt.setUTCDate(nextReviewAt.getUTCDate() + reviewIntervalDays);

  const cmsHtml = markdownToPortableHtml(article.content);
  const faqs = extractFaqs(article.content);
  const articleSchema = {
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    inLanguage: article.locale || 'zh-TW',
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    datePublished: article.createdAt.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: { '@type': 'Organization', name: article.site.name, url: article.site.url },
    publisher: { '@type': 'Organization', name: article.site.name, url: article.site.url },
    about: [article.site.name, article.site.industry].filter(Boolean),
  };
  const graph: Record<string, unknown>[] = [articleSchema];
  if (faqs.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    });
  }
  const jsonLd = { '@context': 'https://schema.org', '@graph': graph };
  const jsonLdText = JSON.stringify(jsonLd, null, 2).replace(/</g, '\\u003c');
  const jsonLdScript = `<script type="application/ld+json">\n${jsonLdText}\n</script>`;
  const metaTags = [
    `<title>${escapeHtml(article.title)}</title>`,
    `<meta name="description" content="${escapeHtml(article.description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
  ].join('\n');
  const htmlDocument = `<!doctype html>
<html lang="${escapeHtml(article.locale || 'zh-TW')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${metaTags.replace(/\n/g, '\n  ')}
  ${jsonLdScript.replace(/\n/g, '\n  ')}
</head>
<body>
  <main>
${cmsHtml.split('\n').map((line) => `    ${line}`).join('\n')}
  </main>
</body>
</html>`;
  const publicationWorkflow = [
    {
      phase: 'publish',
      title: '1. 發布文章',
      steps: [
        '把 CMS HTML 或 Markdown 貼到客戶官網，發布成免登入的正式頁面。',
        '確認標題、摘要、H1 與主要內文都正確顯示。',
      ],
    },
    {
      phase: 'structure',
      title: '2. 補齊頁面訊號',
      steps: [
        '設定 title、meta description、canonical 與 Article JSON-LD。',
        faqs.length > 0
          ? '頁面已有可見問答，請同步放入本發布包提供的 FAQ Schema。'
          : '本篇沒有可見問答，不需要額外加入 FAQ Schema。',
      ],
    },
    {
      phase: 'discover',
      title: '3. 協助爬蟲發現',
      steps: [
        '從官網至少一個現有頁面連到新文章。',
        '把正式網址加入 sitemap；有維護 llms.txt 時再加入提供的索引行。',
      ],
    },
    {
      phase: 'verify',
      title: '4. 發布後驗收',
      steps: [
        '使用無痕視窗與「檢視網頁原始碼」確認內容可直接讀取。',
        '完成下方必做檢查，再到搜尋引擎站長工具提交或檢查網址。',
      ],
    },
  ];
  const verificationSteps = [
    {
      id: 'public-url',
      category: 'access',
      required: true,
      title: '正式網址可公開讀取',
      howToVerify: '用登出或無痕視窗開啟正式網址。',
      successCriteria: '頁面正常顯示，不需登入、沒有密碼牆，也不是 404。',
    },
    {
      id: 'source-html',
      category: 'content',
      required: true,
      title: '原始 HTML 看得到文章',
      howToVerify: '在瀏覽器選擇「檢視網頁原始碼」，搜尋文章標題與一段主要內文。',
      successCriteria: '原始碼直接包含標題與主要內容；若只有空殼，網站需改用 SSR 或靜態產生。',
    },
    {
      id: 'canonical',
      category: 'seo',
      required: true,
      title: 'canonical 指向正式網址',
      howToVerify: '在原始碼搜尋 rel="canonical"。',
      successCriteria: `href 完整等於 ${canonicalUrl}`,
    },
    {
      id: 'article-schema',
      category: 'schema',
      required: true,
      title: 'Article JSON-LD 與文章一致',
      howToVerify: '在原始碼搜尋 application/ld+json，或使用 Schema.org Validator。',
      successCriteria: '可找到 Article，且 headline、url、發布日期與畫面內容一致。',
    },
    {
      id: 'faq-schema',
      category: 'schema',
      required: faqs.length > 0,
      title: faqs.length > 0 ? 'FAQ Schema 與可見問答一致' : 'FAQ Schema（本篇選用）',
      howToVerify: faqs.length > 0
        ? '確認頁面看得到相同問答，原始碼的 FAQPage 內容完全一致。'
        : '只有日後在頁面增加可見問答時才需要加入。',
      successCriteria: faqs.length > 0
        ? 'FAQPage 的每個問題與答案都能在頁面上看見。'
        : '目前不加入 FAQPage 也屬正常。',
    },
    {
      id: 'internal-link',
      category: 'discovery',
      required: true,
      title: '至少有一個站內連結',
      howToVerify: '從官網服務頁、知識中心、文章列表或相關文章點進本篇。',
      successCriteria: '爬蟲不必知道網址，也能從官網既有頁面發現新文章。',
    },
    {
      id: 'sitemap-robots',
      category: 'discovery',
      required: true,
      title: 'sitemap 已收錄且 robots.txt 未封鎖',
      howToVerify: '開啟官網 sitemap 搜尋正式網址，並確認 robots.txt 沒有封鎖文章路徑。',
      successCriteria: 'sitemap 找得到網址，且相關 User-agent 沒有 Disallow 該路徑。',
    },
    {
      id: 'llms-txt',
      category: 'discovery',
      required: false,
      title: 'llms.txt 索引（選用）',
      howToVerify: '若官網有維護 /llms.txt，加入本發布包提供的標題、摘要與正式網址。',
      successCriteria: 'llms.txt 公開可讀且連結正確；沒有使用 llms.txt 不影響文章發布。',
    },
    {
      id: 'webmaster-submit',
      category: 'monitoring',
      required: false,
      title: '站長工具檢查與提交（建議）',
      howToVerify: '到 Google Search Console 與 Bing Webmaster 檢查或提交正式網址。',
      successCriteria: '工具可擷取頁面，且沒有 noindex、封鎖或 canonical 衝突。',
    },
  ];

  return {
    article: {
      slug: article.slug,
      title: article.title,
      description: article.description,
      updatedAt: article.updatedAt,
      dayType: dayType ?? null,
    },
    officialSite: {
      name: article.site.name,
      url: article.site.url,
      canonicalUrl,
      suggestedPath: new URL(canonicalUrl).pathname,
    },
    formats: {
      markdown: article.content,
      cmsHtml,
      jsonLd: jsonLdText,
      jsonLdScript,
      metaTags,
      htmlDocument,
      llmsTxtEntry: `- [${article.title}](${canonicalUrl})：${article.description}`,
      sitemapXmlEntry: `<url>\n  <loc>${escapeHtml(canonicalUrl)}</loc>\n  <lastmod>${article.updatedAt.toISOString()}</lastmod>\n</url>`,
    },
    files: [
      { name: `${article.slug}.md`, purpose: 'Markdown / MDX 網站', content: article.content },
      { name: `${article.slug}.html`, purpose: '靜態 HTML 或開發者參考', content: htmlDocument },
      { name: `${article.slug}.jsonld`, purpose: 'Article 與可見 FAQ 結構化資料', content: jsonLdText },
    ],
    crawlerGuidance: {
      requiresBackendSourceEdit: false,
      explanation:
        'AI 爬蟲讀取公開網址回傳的 HTML，不會直接讀取客戶的後端原始碼。一般 CMS 只要發布成免登入的公開文章即可；自建程式網站則應使用 SSR 或靜態產生，確保「檢視網頁原始碼」能看到標題與主要文章內容。',
      codeBasedSiteSteps: [
        '將 Markdown/MDX 或 HTML 檔加入網站的內容目錄。',
        '建立公開文章路由，使用 SSR 或靜態產生輸出完整 HTML。',
        '加入 canonical、meta description 與本發布包的 JSON-LD。',
        '重新部署，確認免登入可開啟，並在 sitemap 與網站內部連結加入文章網址。',
      ],
    },
    publicationWorkflow,
    updateMatrix: {
      alwaysUpdate: [
        '文章公開 HTML：標題、主要內文與更新日期應在第一次回應即可讀取。',
        '頁面 SEO：title、meta description、canonical 與唯一 H1。',
        'Article JSON-LD：headline、description、正式網址、發布與更新時間。',
        '網站探索：加入至少一個站內連結，並把正式網址與 lastmod 加入 sitemap。',
      ],
      updateWhenApplicable: [
        'FAQ Schema：只有頁面真的顯示相同問答時才加入或更新。',
        'llms.txt：網站有維護這份選用檔案時，加入文章標題、摘要與正式網址。',
        'Open Graph：需要社群分享預覽時，同步更新 og:title、og:description 與 og:url。',
      ],
      usuallyUnchanged: [
        'robots.txt：除非新增文章路徑被封鎖或要調整爬蟲政策，否則不用每篇修改。',
        'Organization／LocalBusiness JSON-LD：只有品牌名稱、地址、電話、服務等基本資料改變時才更新。',
      ],
    },
    cmsInstructions: {
      wordpress: [
        '新增一篇文章，貼上標題、摘要與 Markdown 轉換後 HTML。',
        '用 SEO/Schema 外掛設定 canonical、meta description 與 Article Schema。',
        '發布後用無痕視窗確認網址免登入可讀，再更新 sitemap。',
      ],
      webflow: [
        '在 CMS Collection 建立文章並貼上 HTML 內容。',
        '設定 SEO title、description、canonical，並在頁面 Custom Code 放入 JSON-LD。',
        '發布網站後確認原始碼能看到文章標題與主要段落。',
      ],
      squarespace: [
        '新增 Blog Post 並貼上文章內容。',
        '在 SEO 設定填入標題與摘要；JSON-LD 可放在該頁 Code Injection。',
        '發布後確認文章被網站導覽或相關文章連結到。',
      ],
      genericCms: [
        '新增公開文章並貼上 HTML。',
        '設定正式網址、canonical、meta description 與 JSON-LD。',
        '確認頁面不是 noindex、沒有登入牆，並加入 sitemap。',
      ],
    },
    verificationChecklist: [
      '正式網址使用客戶官方網域，且不需要登入即可讀取。',
      '檢視網頁原始碼時能找到文章標題與主要內文；若只有空殼，改用 SSR 或靜態產生。',
      '頁面只有一個清楚的 H1，canonical 指向目前正式網址。',
      'Article JSON-LD 與畫面內容一致；FAQ Schema 只保留頁面真的看得到的問答。',
      '文章已從服務頁、知識中心或相關文章取得至少一個站內連結。',
      '文章網址已出現在 sitemap，robots.txt 沒有封鎖該路徑。',
      '更新 sitemap 後，用 Google Search Console 與 Bing Webmaster 檢查探索狀態。',
    ],
    verificationSteps,
    reviewReminder: {
      intervalDays: reviewIntervalDays,
      nextReviewAt,
      message:
        reviewIntervalDays === 7
          ? '此篇包含時效性資料，建議每週核對數字、日期與來源。'
          : '建議每 30 天檢查服務、聯絡資訊、品牌事實與來源是否仍正確。',
    },
  };
}

@Injectable()
export class ArticlePublishPackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blogArticleService: BlogArticleService,
  ) {}

  async getClientDailyPackage(
    slug: string,
    canonicalUrl?: string,
    userId?: string,
    role?: string,
  ) {
    const review = await this.blogArticleService.getClientDailyArticleReview(
      slug,
      userId,
      role,
    );
    if (!review.publicVisible) {
      throw new BadRequestException(
        'Only a published article that passes the public quality gate can be exported to the customer official site',
      );
    }

    const article = await this.prisma.blogArticle.findUnique({
      where: { slug },
      select: {
        slug: true,
        title: true,
        description: true,
        content: true,
        locale: true,
        createdAt: true,
        updatedAt: true,
        targetKeywords: true,
        templateType: true,
        siteId: true,
        site: {
          select: { id: true, name: true, url: true, industry: true },
        },
      },
    });

    if (!article || article.templateType !== 'client_daily' || !article.siteId || !article.site) {
      throw new NotFoundException('Client daily article not found');
    }
    await assertSiteAccess(this.prisma, article.siteId, userId, role);

    return buildManualPublishPackage(
      article as PublishPackageArticle,
      canonicalUrl,
    );
  }
}
