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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

const { PrismaClient } = require('@prisma/client');
const { normalizeForSimilarity } = require('../dist/modules/content-quality/text-similarity.util');

const DUP = 0.5;   // near-duplicate
const SIM = 0.35;  // highly similar
const SIZE = 3;

function shingles(norm) {
  const set = new Set();
  if (norm.length < SIZE) { if (norm.length) set.add(norm); return set; }
  for (let i = 0; i <= norm.length - SIZE; i++) set.add(norm.slice(i, i + SIZE));
  return set;
}
function jac(a, b) {
  if (!a.size || !b.size) return 0;
  const [s, l] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const g of s) if (l.has(g)) inter++;
  return inter / (a.size + b.size - inter);
}

(async () => {
  const prisma = new PrismaClient();
  const arts = await prisma.blogArticle.findMany({
    where: { published: true },
    select: { id: true, title: true, content: true, templateType: true, siteId: true,
      createdAt: true, site: { select: { name: true, isClient: true } } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n=== 全站已發佈文章: ${arts.length} 篇 ===`);

  // template type breakdown
  const byType = {};
  for (const a of arts) byType[a.templateType] = (byType[a.templateType] || 0) + 1;
  console.log('\n--- 各 templateType 篇數 ---');
  Object.entries(byType).sort((x, y) => y[1] - x[1]).forEach(([t, n]) => console.log(`  ${t}: ${n}`));

  // precompute shingles
  for (const a of arts) a._sh = shingles(normalizeForSimilarity(a.content || ''));

  // group by site
  const bySite = new Map();
  for (const a of arts) {
    const k = a.siteId || '__none__';
    if (!bySite.has(k)) bySite.set(k, []);
    bySite.get(k).push(a);
  }

  // within-site clustering (union-find)
  function cluster(list) {
    const parent = list.map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const pairs = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const s = jac(list[i]._sh, list[j]._sh);
        if (s >= SIM) { pairs.push([i, j, s]); if (s >= DUP) { const a = find(i), b = find(j); if (a !== b) parent[a] = b; } }
      }
    }
    const groups = new Map();
    for (let i = 0; i < list.length; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
    return { dupGroups: [...groups.values()].filter((g) => g.length > 1), pairs };
  }

  const siteSummaries = [];
  for (const [siteId, list] of bySite) {
    if (list.length < 2) { siteSummaries.push({ name: list[0]?.site?.name || siteId, n: list.length, dupArticles: 0, groups: 0, simPairs: 0 }); continue; }
    const { dupGroups, pairs } = cluster(list);
    const dupArticles = dupGroups.reduce((s, g) => s + g.length, 0);
    const simOnly = pairs.filter((p) => p[2] >= SIM && p[2] < DUP).length;
    siteSummaries.push({ siteId, name: list[0]?.site?.name || siteId, isClient: list[0]?.site?.isClient, n: list.length, dupArticles, groups: dupGroups.length, simPairs: simOnly, _list: list, _dupGroups: dupGroups });
  }

  console.log('\n--- 各站重複概況（依重複文章數排序）---');
  siteSummaries.sort((a, b) => b.dupArticles - a.dupArticles);
  for (const s of siteSummaries) {
    if (s.n < 2 && !s.dupArticles) continue;
    const flag = s.dupArticles > 0 ? '⚠' : '✓';
    console.log(`  ${flag} ${s.name}${s.isClient ? '[客戶]' : ''}: ${s.n} 篇, 重複 ${s.dupArticles} 篇(${s.groups} 群), 另高度相似配對 ${s.simPairs}`);
  }

  // deep-dive the worst 3 sites
  console.log('\n=== 重複群明細（前 3 嚴重的站）===');
  for (const s of siteSummaries.filter((x) => x._dupGroups && x._dupGroups.length).slice(0, 3)) {
    console.log(`\n■ ${s.name} (${s.n} 篇)`);
    s._dupGroups.sort((a, b) => b.length - a.length);
    s._dupGroups.slice(0, 6).forEach((g, gi) => {
      console.log(`  群${gi + 1}（${g.length} 篇近乎重複）:`);
      g.slice(0, 6).forEach((idx) => {
        const a = s._list[idx];
        console.log(`    - [${a.templateType}] ${a.title}  (${a.createdAt.toISOString().slice(0, 10)})`);
      });
    });
  }

  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
