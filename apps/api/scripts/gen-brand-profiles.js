require('reflect-metadata');
const fs = require('fs'), path = require('path');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i); if (!m) continue; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (!process.env[m[1]]) process.env[m[1]] = v; }
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { BrandProfileService } = require('../dist/modules/blog-article/brand-profile.service');

const CLIENTS = [
  ['立如整復', 'cmn908gxe008j8mq3mdkh0emk'],
  ['詹大汽車精品', 'cmn9128eo00pl8mq3391820gm'],
  ['Geovault Platform', 'cmnfmk94z000d3ux9yqoeseyt'],
  ['慈愛中醫', 'cmq9dt88i06kz9wu6fek347ic'],
];

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const svc = app.get(BrandProfileService);
  const summary = [];
  for (const [name, id] of CLIENTS) {
    const t0 = Date.now();
    const r = await svc.generateBrandProfile(id, { force: true });
    const took = ((Date.now() - t0) / 1000).toFixed(0);
    summary.push({ ...r, took });
    console.log(`\n=== ${name} === (${took}s)`);
    console.log(`  status=${r.status}  verdict=${r.verdict || '-'}  score=${r.score ?? '-'}  repaired=${r.repaired ? 'yes' : 'no'}`);
    if (r.slug) console.log(`  slug: ${r.slug}`);
    if (r.reasons && r.reasons.length) console.log(`  reasons: ${r.reasons.join(', ')}`);
  }
  console.log('\n=========== SUMMARY ===========');
  summary.forEach((s) => console.log(`${s.siteName}: ${s.status} ${s.verdict || ''} ${s.score ?? ''}${s.repaired ? ' (repaired)' : ''}`));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
