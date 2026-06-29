require('reflect-metadata');
const fs = require('fs'), path = require('path');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i); if (!m) continue; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (!process.env[m[1]]) process.env[m[1]] = v; }
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { CitationReadinessService } = require('../dist/modules/citation-readiness/citation-readiness.service');
const { PrismaService } = require('../dist/prisma/prisma.service');

// 詹大汽車精品 — default site if no explicit CRG_ARTICLE_ID
const DEFAULT_SITE = process.env.CRG_SITE_ID || 'cmn9128eo00pl8mq3391820gm';
const N = Number(process.env.CRG_COUNT || 3);

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const svc = app.get(CitationReadinessService);
  const prisma = app.get(PrismaService);

  let ids = (process.env.CRG_ARTICLE_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    const arts = await prisma.blogArticle.findMany({
      where: { siteId: DEFAULT_SITE, published: true },
      select: { id: true }, orderBy: { createdAt: 'desc' }, take: N,
    });
    ids = arts.map((a) => a.id);
  }
  console.log(`評估 ${ids.length} 篇文章…\n`);

  const out = [];
  for (const id of ids) {
    const t0 = Date.now();
    const r = await svc.previewArticle(id);
    const took = ((Date.now() - t0) / 1000).toFixed(1);
    out.push(r);
    console.log('============================================================');
    console.log(`${r.siteName} | ${r.title}  (${took}s)`);
    if (r.skipped) { console.log(`  SKIPPED: ${r.skipped}`); continue; }
    const x = r.result;
    console.log(`  判定: ${x.verdict.toUpperCase()}  複合分: ${x.score}`);
    console.log(`  去重: ${x.dedup.score} (vs ${x.dedup.against}, dup=${x.dedup.isDuplicate})`);
    console.log(`  實體: 分${x.entity.score} 品牌名=${x.entity.brandPresent} 官網=${x.entity.officialUrlPresent} 編造聯絡=${x.entity.fabricatedContact.join('|') || '無'} 矛盾=${x.entity.contradictions.join('|') || '無'}`);
    if (x.judge.ok) {
      console.log(`  評審: overall ${x.judge.overall} | 答案前置 ${x.judge.answerFirst} | 可摘 ${x.judge.extractable} | 查詢匹配 ${x.judge.queryMatch} | 具體 ${x.judge.specificity} | 安全 ${x.judge.citationSafety}`);
      console.log(`  目標查詢: ${x.judge.targetQueries.map((q) => '「' + q + '」').join(' ')}`);
      console.log(`  最弱段: ${(x.judge.weakestPassage || '').slice(0, 120)}`);
      console.log(`  改寫建議: ${(x.judge.suggestedRewrite || '').slice(0, 160)}`);
    } else {
      console.log(`  評審不可用: ${x.judge.error}`);
    }
    console.log(`  原因碼: ${x.reasons.join(', ') || '無'}`);
  }

  fs.writeFileSync(path.resolve(__dirname, '..', 'crg-preview-output.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log('\n[完整結果] apps/api/crg-preview-output.json');
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
