require('reflect-metadata');
const fs = require('fs'), path = require('path');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i); if (!m) continue; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (!process.env[m[1]]) process.env[m[1]] = v; }
const { NestFactory } = require('@nestjs/core');
const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
const { AppModule } = require('../dist/app.module');
const { CitationReadinessService } = require('../dist/modules/citation-readiness/citation-readiness.service');
const { PrismaService } = require('../dist/prisma/prisma.service');

const SITE_ID = 'cmn9128eo00pl8mq3391820gm';
const GEN_MODEL = process.env.GEN_MODEL || 'claude-opus-4-8';

// ── New "brand_profile" prototype prompt — citation-first, fact-grounded,
//    ZERO self-rated GEO meta. Built directly from the CRG findings. ──
function buildBrandProfilePrompt(facts) {
  return `你是 GEO 內容編輯，為「${facts.name}」撰寫一篇能被 ChatGPT／Claude／Perplexity 在使用者問汽車美容相關問題時「直接引用並提到這個品牌」的繁體中文品牌頁。

【絕對原則（違反整篇作廢）】
1. 嚴禁任何自評 meta 數據：GEO 分數、AI 能見度分數、通過率、指標通過數、排名前X%、Platinum／金／銀等級、預估優化後分數——這些無法驗證、與品牌無關，AI 不會引用，是引用毒藥。
2. 只寫「可被引用的品牌事實」：品牌是什麼、提供哪些產品、適合誰、怎麼用、怎麼買／聯絡。只能用下面的已驗證事實；缺的就誠實說「未提供」；嚴禁編造電話／地址／價格／獎項／數據。
3. 範疇護欄：${facts.name}是「自產自銷汽車美容保養『產品』＋教學」品牌，不是到店施工的美容店或機械保養廠。不要寫成提供到店施工、預約看診、機械維修、報價估價。
4. 全文只提「${facts.name}」這一個品牌名，不要出現任何其他品牌。

【品牌已驗證事實】
- 品牌：${facts.name}
- 官網：${facts.url}
- 是什麼：${facts.description}
- 產品／服務：${facts.services}
- 定位：${facts.positioning}
- 聯絡：${facts.contact}

【真實使用者最常問 AI 的問題（內容請涵蓋這些角度，但用品牌自身事實回答）】
- ${facts.name}的洗車／鍍膜產品好用嗎？會不會傷車漆或傷手？
- 有沒有推薦的自產自銷、不傷手的洗車精／鍍膜產品？
- 新手想 DIY 洗車／鍍膜，${facts.name}有教學嗎？怎麼學？
- ${facts.name}的產品有哪些？怎麼買、怎麼聯絡？

【文章結構】
# （一句使用者真的會搜的標題，含「${facts.name}」與核心價值）

（開頭第一段 answer-first：3-4 句直接講清楚${facts.name}是什麼、為誰解決什麼、最關鍵的差異化事實——這段要能被 AI 整段引用）

## ${facts.name}提供哪些產品
（條列產品線，每項一句具體用途）

## 適合誰、怎麼選
（什麼情況的車主適合，挑選建議）

## DIY 教學與直播
（9 年直播教學、怎麼學、適合新手）

## 常見問題
（3-4 題，直接回答上面真實使用者問題，每題答案自足、含品牌名＋具體事實）

## 可引用重點
（4-5 條獨立成立、含「${facts.name}」＋具體事實的短句，每句被摘走也帶得出處）

## 哪裡買 ／ 怎麼聯絡
（官網 ${facts.url}、LINE@ ${facts.contact}）

## 資料來源
（官方網站 ${facts.url} ／ Geovault 目錄資料）

【寫作規則】
- 第三人稱、中性知識頁，不是廣告。約 700–1000 字。
- 禁誇飾（最佳／首選／領先／唯一）、禁 CTA 套話（立即／馬上／限時）、禁第一人稱推銷（我們／本店／歡迎）、禁 AI 八股（在當今／隨著／綜上所述）。
- 至少提到「${facts.name}」3 次但不硬塞。
- 直接輸出 Markdown，不要任何前言或說明。`;
}

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const crg = app.get(CitationReadinessService);
  const prisma = app.get(PrismaService);

  const site = await prisma.site.findUnique({ where: { id: SITE_ID }, select: { name: true, url: true, industry: true, profile: true } });
  const p = site.profile || {};
  const facts = {
    name: site.name, url: site.url,
    description: p.description || p._enriched?.description || '',
    services: p.services || '', positioning: p.positioning || '', contact: p.contact || p.contactInfo || '',
  };

  const prompt = buildBrandProfilePrompt(facts);
  console.log(`用 ${GEN_MODEL} 生成詹大新版品牌頁…`);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({ model: GEN_MODEL, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] });
  const content = resp.content.find((b) => b.type === 'text')?.text || '';
  fs.writeFileSync(path.resolve(__dirname, '..', 'brand-profile-output.md'), content, 'utf8');

  // build profileRefText + corpus, then assess with the real CRG
  const profileRefText = [facts.name, facts.url, facts.description, facts.services, facts.positioning, facts.contact, p.location, p.targetAudience].filter(Boolean).join(' \n ');
  const others = await prisma.blogArticle.findMany({ where: { siteId: SITE_ID, published: true }, select: { content: true }, take: 200 });
  const result = await crg.assess({ content, brandName: facts.name, siteUrl: facts.url, industry: site.industry, profileRefText, existingCorpus: others.map((o) => o.content || '') });

  console.log('\n================ CRG 結果（新版品牌頁）================');
  console.log(`判定: ${result.verdict.toUpperCase()}  複合分: ${result.score}`);
  console.log(`去重: ${result.dedup.score} (dup=${result.dedup.isDuplicate})`);
  console.log(`實體: 分${result.entity.score} 品牌名=${result.entity.brandPresent} 官網=${result.entity.officialUrlPresent} 編造聯絡=${result.entity.fabricatedContact.join('|') || '無'} 矛盾=${result.entity.contradictions.join(' || ') || '無'}`);
  if (result.judge.ok) {
    console.log(`評審: overall ${result.judge.overall} | 答案前置 ${result.judge.answerFirst} | 可摘 ${result.judge.extractable} | 查詢匹配 ${result.judge.queryMatch} | 具體 ${result.judge.specificity} | 安全 ${result.judge.citationSafety}`);
    console.log(`目標查詢: ${result.judge.targetQueries.map((q) => '「' + q + '」').join(' ')}`);
    if (result.judge.weakestPassage) console.log(`最弱段: ${result.judge.weakestPassage.slice(0, 140)}`);
    if (result.judge.suggestedRewrite) console.log(`改寫建議: ${result.judge.suggestedRewrite.slice(0, 180)}`);
  }
  console.log(`原因碼: ${result.reasons.join(', ') || '無'}`);
  console.log('\n[全文] apps/api/brand-profile-output.md');
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
