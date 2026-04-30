// Backfill script — generates the missing client_daily articles for the
// two paying clients from their join date through today.
//
// Key differences from the regular cron path:
//   1. backdates BlogArticle.createdAt to the date the article SHOULD have
//      been published (otherwise 110 articles all timestamped "today" looks
//      like spam to AI crawlers + breaks chronological listings).
//   2. passes referenceDate to BlogTemplateService.buildClientDailyPrompt so
//      copy like "${year}年${month}月時事" anchors to the past month.
//   3. bypasses generateClientDailyContent's 24h idempotency guard (we WANT
//      multiple dayTypes per backfill run for the same site).
//   4. routes through ContentQualityRunner so every attempt still lands in
//      ArticleQualityLog under the v3 promptVersion.

require('reflect-metadata');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { BlogTemplateService } = require('../dist/modules/blog-article/blog-template.service');
const { ContentQualityRunner } = require('../dist/modules/content-quality/content-quality.runner');
const { createClientDailySpec } = require('../dist/modules/content-quality/specs/client-daily.spec');
const { extractNicheKeywords } = require('../dist/modules/blog-article/niche-keyword.util');

const SITES = [
  { id: 'cmn9128eo00pl8mq3391820gm', name: '詹大汽車精品' },
  { id: 'cmn908gxe008j8mq3mdkh0emk', name: '立如整復' },
  { id: 'cmnfmk94z000d3ux9yqoeseyt', name: 'Geovault Platform' },
];

const DAY_SEQ = [
  null, 'mon_topical', 'tue_qa_deepdive', 'wed_service',
  'thu_audience', 'fri_comparison', 'sat_data_pulse',
];

const CONCURRENCY = 2;

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  const prisma = app.get(PrismaService);
  const templateService = app.get(BlogTemplateService);
  const runner = app.get(ContentQualityRunner);

  const summary = { generated: 0, rejected: 0, errors: 0, items: [] };

  for (const s of SITES) {
    const site = await prisma.site.findUnique({
      where: { id: s.id },
      select: {
        id: true, name: true, url: true, industry: true, createdAt: true,
        profile: true,
        qas: { orderBy: { sortOrder: 'asc' }, take: 15, select: { question: true, answer: true } },
      },
    });
    if (!site) { console.log(`SKIP ${s.name}: not found`); continue; }

    // Build the same context that the regular cron path builds.
    const profile = site.profile || {};
    const enriched = profile._enriched || {};
    const ctx = {
      siteId: site.id,
      qas: site.qas,
      description: enriched.description || profile.description,
      services: profile.services,
      location: profile.location || enriched.address,
      contact: profile.contact || enriched.telephone,
      forbidden: Array.isArray(profile.forbidden) ? profile.forbidden : [],
      positioning: profile.positioning,
      socialLinks: enriched.socialLinks,
    };
    ctx._enriched = enriched;

    const profileRefText = [
      ctx.contact, ctx.location, ctx.description, ctx.services, ctx.positioning,
      site.url, ctx.socialLinks?.facebook, ctx.socialLinks?.instagram,
      ctx.socialLinks?.youtube, ctx.socialLinks?.line,
      enriched.telephone, enriched.email, enriched.address,
    ].filter(Boolean).join(' \n ');

    const desc = enriched.description || profile.description || '';
    const nicheKeywords = extractNicheKeywords(desc, { name: site.name, industry: site.industry });

    // Compute what's missing.
    const existing = await prisma.blogArticle.findMany({
      where: { siteId: site.id, templateType: 'client_daily' },
      select: { createdAt: true, targetKeywords: true },
    });
    const covered = new Set();
    for (const a of existing) {
      const dt = a.targetKeywords.find((k) => /^(mon|tue|wed|thu|fri|sat)_/.test(k));
      const iso = a.createdAt.toISOString().slice(0, 10);
      if (dt) covered.add(`${iso}|${dt}`);
    }

    const startDay = new Date(site.createdAt);
    startDay.setUTCHours(0, 0, 0, 0);
    const endDay = new Date();
    endDay.setUTCHours(0, 0, 0, 0);

    const missing = [];
    for (let d = new Date(startDay); d <= endDay; d.setUTCDate(d.getUTCDate() + 1)) {
      const dt = DAY_SEQ[d.getUTCDay()];
      if (!dt) continue;
      const iso = d.toISOString().slice(0, 10);
      if (!covered.has(`${iso}|${dt}`)) missing.push({ iso, dt, date: new Date(d) });
    }

    console.log(`\n=== ${site.name} | missing ${missing.length} 篇 ===`);

    // Concurrency limiter (in-house — avoid extra dep).
    let inFlight = 0;
    let cursor = 0;
    const results = [];

    async function processOne(job) {
      const { iso, dt, date } = job;
      const refDate = new Date(date);
      refDate.setUTCHours(12, 0, 0, 0); // anchor each article at noon UTC of its date

      // sat_data_pulse needs pulse data; use today's snapshot since we can't
      // reconstruct historical scan numbers reliably. Skip the heavy reads
      // for non-sat days.
      let pulse;
      if (dt === 'sat_data_pulse') {
        try {
          const latestScan = await prisma.scan.findFirst({
            where: { siteId: site.id, status: 'COMPLETED' },
            orderBy: { completedAt: 'desc' },
            select: { totalScore: true },
          });
          const indStats = site.industry
            ? await prisma.site.aggregate({
                where: { industry: site.industry, isPublic: true, bestScore: { gt: 0 } },
                _avg: { bestScore: true },
              })
            : null;
          const rank = site.industry
            ? (await prisma.site.count({
                where: { industry: site.industry, isPublic: true, bestScore: { gt: latestScan?.totalScore ?? 0 } },
              })) + 1
            : null;
          pulse = {
            geoScore: latestScan?.totalScore ?? 0,
            industryRank: rank,
            industryAvgScore: indStats?._avg.bestScore ? Math.round(indStats._avg.bestScore) : null,
            weekCrawlerVisits: 0, // historical traffic data not available
          };
        } catch (e) {
          pulse = { geoScore: 0, industryRank: null, industryAvgScore: null, weekCrawlerVisits: 0 };
        }
      }

      const prompt = templateService.buildClientDailyPrompt(
        dt,
        { name: site.name, url: site.url, industry: site.industry ?? undefined },
        ctx,
        pulse,
        refDate, // PR — past-date prompt anchoring
      );

      const spec = createClientDailySpec(dt);
      const runStartedAt = new Date();
      let result;
      try {
        result = await runner.run(
          spec,
          { basePrompt: prompt },
          {
            siteName: site.name,
            industry: site.industry ?? undefined,
            extras: {
              nicheKeywords,
              forbidden: ctx.forbidden ?? [],
              profileRefText,
              siteUrl: site.url,
            },
          },
          site.id,
        );
      } catch (e) {
        return { iso, dt, status: 'error', err: e?.message || String(e) };
      }

      if (result.status !== 'generated' || !result.content) {
        return { iso, dt, status: 'rejected', reasons: result.failedRules };
      }

      const content = result.content;
      const titleMatch = content.match(/^#{1,2}\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : `${site.name} ${dt}`;
      const yyyymm = `${refDate.getUTCFullYear()}${String(refDate.getUTCMonth() + 1).padStart(2, '0')}`;
      const rand4 = (Date.now() + Math.floor(Math.random() * 1000)).toString(36).slice(-4);
      const slug = `${site.id.slice(0, 10)}-${yyyymm}-${dt.replace(/_/g, '-')}-${rand4}`;

      const bodyLines = content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('*資料來源'));
      const firstParagraph = bodyLines.find((l) => l.length > 30) ?? bodyLines[0] ?? '';
      const description = firstParagraph.replace(/[*_`]/g, '').replace(/\s+/g, ' ').slice(0, 155).trim();

      const article = await prisma.blogArticle.create({
        data: {
          slug,
          title,
          description,
          content,
          category: 'client-daily',
          siteId: site.id,
          templateType: 'client_daily',
          industrySlug: site.industry ?? undefined,
          targetKeywords: [site.name, site.industry ?? '', dt, 'daily'].filter(Boolean),
          readingTimeMinutes: 5,
          readTime: '5 分鐘',
          published: true,
          createdAt: refDate,           // ← BACKDATE
          updatedAt: refDate,
          lastRegeneratedAt: refDate,
        },
      });
      // Back-fill articleId on every quality-log row from this run
      await runner.attachArticleId(`client_daily/${dt}`, site.id, article.id, runStartedAt);
      return { iso, dt, status: 'generated', slug };
    }

    await new Promise((resolve) => {
      const next = () => {
        while (inFlight < CONCURRENCY && cursor < missing.length) {
          const idx = cursor++;
          const job = missing[idx];
          inFlight++;
          processOne(job).then((r) => {
            inFlight--;
            results.push(r);
            const ok = r.status === 'generated';
            const tag = ok ? '✓' : (r.status === 'rejected' ? '✗' : '!');
            const detail = ok ? r.slug : (r.reasons || r.err || '').toString().slice(0, 80);
            console.log(`[${results.length}/${missing.length}] ${tag} ${r.iso} ${r.dt} ${detail}`);
            if (ok) summary.generated++;
            else if (r.status === 'rejected') summary.rejected++;
            else summary.errors++;
            summary.items.push({ site: site.name, ...r });
            if (cursor < missing.length) next();
            else if (inFlight === 0) resolve();
          });
        }
      };
      if (missing.length === 0) resolve();
      else next();
    });
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`generated: ${summary.generated}`);
  console.log(`rejected:  ${summary.rejected}`);
  console.log(`errors:    ${summary.errors}`);
  if (summary.rejected + summary.errors > 0) {
    console.log(`\n--- failures ---`);
    for (const it of summary.items) {
      if (it.status !== 'generated') {
        console.log(`${it.site} | ${it.iso} ${it.dt} | ${it.status} | ${(it.reasons || it.err || '').toString().slice(0, 100)}`);
      }
    }
  }

  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
