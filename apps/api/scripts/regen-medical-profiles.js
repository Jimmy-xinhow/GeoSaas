require('reflect-metadata');
const fs = require('fs'), path = require('path');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i); if (!m) continue; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (!process.env[m[1]]) process.env[m[1]] = v; }
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { BrandProfileService } = require('../dist/modules/blog-article/brand-profile.service');
const { PrismaService } = require('../dist/prisma/prisma.service');

const TARGETS = [
  ['立如整復', 'cmn908gxe008j8mq3mdkh0emk', false],   // 非醫療定位 → boundary
  ['慈愛中醫', 'cmq9dt88i06kz9wu6fek347ic', true],     // 有照中醫診所 → licensed
];
const TERMS = ['治療','療效','療法','療程','治癒','根治','診斷','緩解','減輕','舒緩','改善','疼痛','痠痛','酸痛','症狀','不適','恢復','復原','疲勞','根除','痊癒'];

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const svc = app.get(BrandProfileService);
  const prisma = app.get(PrismaService);

  for (const [name, id, licensed] of TARGETS) {
    // 1. set the per-brand flag in profile JSON
    const site = await prisma.site.findUnique({ where: { id }, select: { profile: true } });
    const profile = { ...(site.profile || {}), isLicensedMedical: licensed };
    await prisma.site.update({ where: { id }, data: { profile } });
    // 2. drop existing brand_profile, regenerate with the new mode
    await prisma.blogArticle.deleteMany({ where: { siteId: id, templateType: 'brand_profile' } });
    const t0 = Date.now();
    const r = await svc.generateBrandProfile(id, { force: true });
    const took = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`\n=== ${name} (isLicensedMedical=${licensed}) === (${took}s)`);
    console.log(`  status=${r.status} verdict=${r.verdict || '-'} score=${r.score ?? '-'} repaired=${r.repaired ? 'yes' : 'no'}`);
    if (r.reasons && r.reasons.length) console.log(`  reasons: ${r.reasons.join(', ')}`);
    // 3. re-scan medical terms
    const a = await prisma.blogArticle.findFirst({ where: { siteId: id, templateType: 'brand_profile' }, orderBy: { createdAt: 'desc' }, select: { title: true, content: true } });
    if (a) {
      console.log(`  標題: ${a.title}`);
      const hits = TERMS.filter((t) => a.content.includes(t));
      console.log(`  醫療詞: ${hits.length ? hits.join('、') : '(無)'}`);
    }
  }
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
