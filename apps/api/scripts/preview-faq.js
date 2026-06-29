require('reflect-metadata');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { FaqArticleService } = require('../dist/modules/blog-article/faq-article.service');

// 詹大汽車精品 — FAQ 最豐富的付費客戶
const SITE_ID = process.env.PREVIEW_SITE_ID || 'cmn9128eo00pl8mq3391820gm';
const LIMIT = Number(process.env.PREVIEW_LIMIT || 5);

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  const svc = app.get(FaqArticleService);

  const t0 = Date.now();
  const result = await svc.previewSiteFaqArticles(SITE_ID, { limit: LIMIT });
  const took = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n================ FAQ PREVIEW ================');
  console.log(`site: ${result.siteName || SITE_ID}  status=${result.status}  (${took}s)`);
  console.log(`requested=${result.requested}  selected=${result.selected}  candidates=${result.candidates.length}`);
  if (result.reasons) console.log(`reasons: ${result.reasons.join(' | ')}`);

  result.candidates.forEach((c, i) => {
    console.log('\n----------------------------------------------------');
    console.log(`#${i + 1}  [${c.status}]  score=${c.totalScore ?? '-'}`);
    console.log(`來源問題: ${c.sourceQuestion}  (類別: ${c.sourceCategory || '無'})`);
    console.log(`標題: ${c.title}`);
    if (c.failedRules && c.failedRules.length) console.log(`失敗規則: ${c.failedRules.join(', ')}`);
    console.log(
      `相似度: ${c.similarity.score} vs ${c.similarity.against} ` +
        `(門檻 ${c.similarity.threshold}, 重複=${c.similarity.isDuplicate})`,
    );
    console.log('--- 內文 ---');
    console.log(c.content || '(空)');
  });

  // 同時寫一份 JSON 方便檢視
  const outPath = path.resolve(__dirname, '..', 'faq-preview-output.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\n[完整結果已寫入] ${outPath}`);

  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
