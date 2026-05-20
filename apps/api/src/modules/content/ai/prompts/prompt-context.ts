export interface BrandKnowledgeQa {
  question: string;
  answer: string;
  category?: string | null;
}

export interface ContentPromptContext {
  brandName: string;
  siteUrl: string;
  industry?: string | null;
  description?: string | null;
  services?: string | null;
  targetAudiences?: string[];
  location?: string | null;
  positioning?: string | null;
  contact?: string | null;
  keywords: string[];
  qas: BrandKnowledgeQa[];
  latestScore?: number | null;
  language: string;
}

export function formatBrandFacts(context: ContentPromptContext): string {
  const facts = [
    `品牌名稱：${context.brandName}`,
    `官方網站：${context.siteUrl}`,
    context.industry ? `產業：${context.industry}` : null,
    context.description ? `品牌描述：${context.description}` : null,
    context.services ? `產品或服務：${context.services}` : null,
    context.targetAudiences?.length ? `目標受眾：${context.targetAudiences.join('、')}` : null,
    context.location ? `服務地區：${context.location}` : null,
    context.positioning ? `定位：${context.positioning}` : null,
    context.contact ? `公開聯絡資訊：${context.contact}` : null,
    typeof context.latestScore === 'number' ? `最新 GEO 分數：${context.latestScore}/100` : null,
    context.keywords.length ? `本次生成重點：${context.keywords.join('、')}` : null,
  ].filter(Boolean);

  const qaFacts = context.qas.slice(0, 12).map((qa, index) => {
    const category = qa.category ? `（${qa.category}）` : '';
    return `${index + 1}. ${qa.question}${category}\n   ${qa.answer}`;
  });

  return `${facts.join('\n')}\n\n知識庫 Q&A：\n${qaFacts.length ? qaFacts.join('\n') : '尚未建立公開 Q&A，請只使用上方已知品牌資料。'}`;
}
