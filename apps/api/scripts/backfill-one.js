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

const SITE = { id: 'cmn9128eo00pl8mq3391820gm', name: '詹大汽車精品' };
const DAY = 'wed_service';
const MAX_OUTER_RETRY = 8;

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  const svc = app.get(BlogArticleService);

  for (let i = 0; i < MAX_OUTER_RETRY; i++) {
    const t0 = Date.now();
    try {
      const r = await svc.generateClientDailyContent(SITE.id, DAY);
      const took = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `[${DAY}] ${SITE.name} attempt ${i + 1}: ${r.status}` +
          (r.slug ? ` slug=${r.slug}` : '') +
          (r.reasons ? ` reasons=${r.reasons.join('|')}` : '') +
          ` (${took}s)`,
      );
      if (r.status === 'generated') break;
      if (r.status === 'skipped' && r.reasons && r.reasons.includes('already_generated_today')) break;
    } catch (e) {
      console.error(`attempt ${i + 1} ERROR:`, e?.message || e);
    }
  }

  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
