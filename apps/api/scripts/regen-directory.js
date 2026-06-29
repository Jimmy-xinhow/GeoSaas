require('reflect-metadata');
const fs = require('fs'), path = require('path');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i); if (!m) continue; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (!process.env[m[1]]) process.env[m[1]] = v; }
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { BlogArticleService } = require('../dist/modules/blog-article/blog-article.service');
const { PrismaService } = require('../dist/prisma/prisma.service');

const DIRECTORY_TYPES = ['geo_overview', 'score_breakdown', 'competitor_comparison', 'improvement_tips', 'industry_benchmark', 'brand_reputation'];
// comma-separated siteIds via env, else default to one test site (詹大)
const SITE_IDS = (process.env.REGEN_SITE_IDS || 'cmn9128eo00pl8mq3391820gm').split(',').map(s => s.trim()).filter(Boolean);

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const svc = app.get(BlogArticleService);
  const prisma = app.get(PrismaService);

  for (const siteId of SITE_IDS) {
    const site = await prisma.site.findUnique({ where: { id: siteId }, select: { name: true } });
    const before = await prisma.blogArticle.findMany({ where: { siteId, templateType: { in: DIRECTORY_TYPES } }, select: { id: true, templateType: true, title: true } });
    console.log(`\n=== ${site?.name || siteId} ===`);
    console.log(`現有目錄文 ${before.length} 篇 → 刪除後重生成`);
    const del = await prisma.blogArticle.deleteMany({ where: { siteId, templateType: { in: DIRECTORY_TYPES } } });
    console.log(`已刪 ${del.count} 篇`);
    const t0 = Date.now();
    const r = await svc.generateArticlesForSite(siteId);
    console.log(`重生成完成 (${((Date.now() - t0) / 1000).toFixed(0)}s): 產出 ${r.generated.length} 篇`, r.generated);
    // show new FAQ questions from one regenerated article
    const sample = await prisma.blogArticle.findFirst({ where: { siteId, templateType: 'geo_overview' }, select: { content: true } });
    if (sample) {
      const faqIdx = sample.content.indexOf('常見問題');
      const qs = (sample.content.slice(faqIdx).match(/\*\*Q[:：][^\n]+/g) || []).slice(0, 4);
      console.log('  新 geo_overview 的 FAQ 問句:');
      qs.forEach(q => console.log('   ' + q.replace(/\*\*/g, '').trim()));
    }
  }
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
