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

(async () => {
  const p = new PrismaClient();
  const articles = await p.blogArticle.findMany({
    where: { templateType: 'client_daily', createdAt: { gte: new Date('2026-04-25') } },
    select: { siteId: true, slug: true, title: true, createdAt: true, targetKeywords: true, site: { select: { name: true } } },
    orderBy: [{ siteId: 'asc' }, { createdAt: 'asc' }],
  });
  for (const a of articles) {
    const dayType = a.targetKeywords.find((k) => k.startsWith('mon_') || k.startsWith('tue_') || k.startsWith('wed_') || k.startsWith('thu_') || k.startsWith('fri_') || k.startsWith('sat_'));
    console.log(`${a.site?.name || '?'} | ${a.createdAt.toISOString().slice(0, 10)} | ${dayType || '?'} | ${a.title}`);
  }
  await p.$disconnect();
})();
