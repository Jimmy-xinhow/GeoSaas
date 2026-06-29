require('reflect-metadata');
const fs = require('fs'), path = require('path');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i); if (!m) continue; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (!process.env[m[1]]) process.env[m[1]] = v; }
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { BrandProfileService } = require('../dist/modules/blog-article/brand-profile.service');
const { PrismaService } = require('../dist/prisma/prisma.service');

const N = Number(process.env.PILOT_N || 12);
const DEMOTE = ['geo_overview', 'brand_reputation', 'industry_benchmark', 'competitor_comparison'];

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const svc = app.get(BrandProfileService);
  const prisma = app.get(PrismaService);
  console.log(`生成模型: ${process.env.BRAND_PROFILE_MODEL || '(default opus)'} | 評審: ${process.env.CRG_JUDGE_MODEL || '(default opus)'}`);

  // candidates: public, non-client, has a usable description, no brand_profile yet
  const pool = await prisma.site.findMany({
    where: { isPublic: true, isClient: false },
    select: { id: true, name: true, profile: true, blogArticles: { where: { templateType: 'brand_profile' }, select: { id: true } } },
    orderBy: { createdAt: 'asc' },
    take: 600,
  });
  const candidates = pool.filter((s) => {
    if (s.blogArticles.length) return false;
    const pr = s.profile || {};
    const desc = pr.description || pr._enriched?.description || '';
    return typeof desc === 'string' && desc.length >= 40;
  }).slice(0, N);

  console.log(`試點 ${candidates.length} 個品牌\n`);
  const summary = { ready: 0, repair: 0, reject: 0, skipped: 0, scores: [] };
  for (const s of candidates) {
    const t0 = Date.now();
    let r;
    try { r = await svc.generateBrandProfile(s.id, { force: false }); }
    catch (e) { console.log(`✗ ${s.name}: ERROR ${String(e).slice(0, 80)}`); summary.skipped++; continue; }
    const took = ((Date.now() - t0) / 1000).toFixed(0);
    if (r.status === 'generated') {
      summary.ready++; summary.scores.push(r.score);
      // unpublish old GEO brand pages now that a citable page exists
      const dem = await prisma.blogArticle.updateMany({ where: { siteId: s.id, templateType: { in: DEMOTE }, published: true }, data: { published: false } });
      console.log(`✓ ${s.name}: READY ${r.score}${r.repaired ? ' (repaired)' : ''} | 下架舊 GEO ${dem.count} (${took}s)`);
    } else if (r.status === 'rejected') {
      if (r.verdict === 'repair') summary.repair++; else summary.reject++;
      console.log(`✗ ${s.name}: ${r.verdict || 'rejected'} ${r.score ?? ''} | ${(r.reasons || []).slice(0, 3).join(', ')} (${took}s)`);
    } else {
      summary.skipped++;
      console.log(`- ${s.name}: skipped ${(r.reasons || []).join(',')} (${took}s)`);
    }
  }
  const avg = summary.scores.length ? (summary.scores.reduce((a, b) => a + b, 0) / summary.scores.length).toFixed(0) : '-';
  console.log(`\n=== 試點結果 ===`);
  console.log(`READY ${summary.ready} | repair ${summary.repair} | reject ${summary.reject} | skipped ${summary.skipped} | 平均分(ready) ${avg}`);
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
