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
const { BlogArticleService } = require('../dist/modules/blog-article/blog-article.service');

const SITE_IDS = [
  { id: 'cmnfmk94z000d3ux9yqoeseyt', name: 'Geovault Platform' },
  { id: 'cmn9128eo00pl8mq3391820gm', name: '詹大汽車精品' },
  { id: 'cmn908gxe008j8mq3mdkh0emk', name: '立如整復' },
];

const DAYS = ['tue_qa_deepdive', 'wed_service', 'thu_audience'];
const MAX_OUTER_RETRY = 2;

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  const svc = app.get(BlogArticleService);

  const summary = [];

  for (const day of DAYS) {
    for (const site of SITE_IDS) {
      let final = null;
      let attempts = 0;
      for (let i = 0; i < MAX_OUTER_RETRY; i++) {
        attempts++;
        const t0 = Date.now();
        try {
          const r = await svc.generateClientDailyContent(site.id, day);
          const took = ((Date.now() - t0) / 1000).toFixed(1);
          console.log(
            `[${day}] ${site.name} attempt ${attempts}: ${r.status}` +
              (r.slug ? ` slug=${r.slug}` : '') +
              (r.reasons ? ` reasons=${r.reasons.join('|')}` : '') +
              ` (${took}s)`,
          );
          if (r.status === 'generated') {
            final = r;
            break;
          }
          if (r.status === 'skipped' && r.reasons && r.reasons.includes('already_generated_today')) {
            final = r;
            break;
          }
          // rejected → continue loop
        } catch (e) {
          console.error(`[${day}] ${site.name} attempt ${attempts} ERROR:`, e?.message || e);
        }
      }
      summary.push({ day, site: site.name, attempts, status: final?.status || 'failed_all_retries', slug: final?.slug });
    }
  }

  console.log('\n=== SUMMARY ===');
  for (const s of summary) {
    console.log(`${s.day} | ${s.site}: ${s.status} (${s.attempts} attempts)${s.slug ? ' ' + s.slug : ''}`);
  }

  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
