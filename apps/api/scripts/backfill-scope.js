require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
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

const SITES = [
  { id: 'cmn9128eo00pl8mq3391820gm', name: '詹大汽車精品' },
  { id: 'cmn908gxe008j8mq3mdkh0emk', name: '立如整復' },
  { id: 'cmnfmk94z000d3ux9yqoeseyt', name: 'Geovault Platform' },
];

const DAY_SEQ = [
  null,                  // Sun
  'mon_topical',
  'tue_qa_deepdive',
  'wed_service',
  'thu_audience',
  'fri_comparison',
  'sat_data_pulse',
];

(async () => {
  const p = new PrismaClient();
  for (const s of SITES) {
    const site = await p.site.findUnique({
      where: { id: s.id },
      select: {
        id: true, name: true, createdAt: true,
        isClient: true, isPublic: true, profile: true,
        user: { select: { plan: true, role: true } },
      },
    });
    if (!site) { console.log(`${s.name}: NOT FOUND`); continue; }

    const articles = await p.blogArticle.findMany({
      where: { siteId: s.id, templateType: 'client_daily' },
      select: { createdAt: true, targetKeywords: true, slug: true },
      orderBy: { createdAt: 'asc' },
    });

    // Build set of (dateISO, dayType) already covered
    const covered = new Set();
    for (const a of articles) {
      const dt = a.targetKeywords.find((k) => /^(mon|tue|wed|thu|fri|sat)_/.test(k));
      const dateISO = a.createdAt.toISOString().slice(0, 10);
      if (dt) covered.add(`${dateISO}|${dt}`);
    }

    // Walk every day from site.createdAt to today, list missing
    const start = new Date(site.createdAt);
    start.setUTCHours(0, 0, 0, 0);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const missing = [];
    for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
      const dow = d.getUTCDay();
      const dt = DAY_SEQ[dow];
      if (!dt) continue; // Sunday
      const iso = d.toISOString().slice(0, 10);
      if (!covered.has(`${iso}|${dt}`)) missing.push({ iso, dt });
    }

    const profile = (site.profile && site.profile.dailyContentPaused) || false;
    console.log(`\n=== ${site.name} (${s.id}) ===`);
    console.log(`createdAt: ${site.createdAt.toISOString().slice(0, 10)}`);
    console.log(`isClient: ${site.isClient} | isPublic: ${site.isPublic} | plan: ${site.user?.plan} | role: ${site.user?.role}`);
    console.log(`existing client_daily articles: ${articles.length}`);
    console.log(`work days since join (Mon-Sat): ${missing.length + articles.length}`);
    console.log(`already covered: ${articles.length}`);
    console.log(`MISSING: ${missing.length} 篇`);
    console.log(`first missing: ${missing[0]?.iso} ${missing[0]?.dt}`);
    console.log(`last missing: ${missing[missing.length - 1]?.iso} ${missing[missing.length - 1]?.dt}`);

    // Group by dayType
    const byDay = {};
    for (const m of missing) byDay[m.dt] = (byDay[m.dt] || 0) + 1;
    console.log(`by dayType:`, byDay);
  }
  await p.$disconnect();
})();
