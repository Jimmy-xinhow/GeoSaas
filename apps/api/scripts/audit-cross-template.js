require('reflect-metadata');
const fs = require('fs');
const path = require('path');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue; const k = m[1]; let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
const { PrismaClient } = require('@prisma/client');
const { normalizeForSimilarity } = require('../dist/modules/content-quality/text-similarity.util');
const SIZE = 3;
function shingles(norm) { const s = new Set(); if (norm.length < SIZE) { if (norm.length) s.add(norm); return s; } for (let i = 0; i <= norm.length - SIZE; i++) s.add(norm.slice(i, i + SIZE)); return s; }
function jac(a, b) { if (!a.size || !b.size) return 0; const [s, l] = a.size <= b.size ? [a, b] : [b, a]; let n = 0; for (const g of s) if (l.has(g)) n++; return n / (a.size + b.size - n); }
// deterministic sample (no Math.random)
function sample(arr, k) { if (arr.length <= k) return arr.slice(); const step = arr.length / k; const out = []; for (let i = 0; i < k; i++) out.push(arr[Math.floor(i * step)]); return out; }

(async () => {
  const prisma = new PrismaClient();
  const arts = await prisma.blogArticle.findMany({
    where: { published: true },
    select: { id: true, title: true, content: true, templateType: true, siteId: true, site: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const byType = new Map();
  for (const a of arts) { if (!byType.has(a.templateType)) byType.set(a.templateType, []); byType.get(a.templateType).push(a); }

  console.log('\n=== 跨站同型別重複度（每型別抽樣 80 篇，兩兩 trigram 相似度）===');
  console.log('重複定義: ≥0.5 近乎重複, 0.35–0.5 高度相似\n');
  const SN = 80;
  for (const [type, list] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const s = sample(list, SN);
    s.forEach((a) => (a._sh = shingles(normalizeForSimilarity(a.content || ''))));
    let sum = 0, cnt = 0, dup = 0, sim = 0; const sims = [];
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      const v = jac(s[i]._sh, s[j]._sh); sum += v; cnt++; sims.push(v);
      if (v >= 0.5) dup++; if (v >= 0.35 && v < 0.5) sim++;
    }
    sims.sort((a, b) => a - b);
    const mean = cnt ? sum / cnt : 0; const med = sims.length ? sims[Math.floor(sims.length / 2)] : 0; const max = sims.length ? sims[sims.length - 1] : 0;
    const pctDup = cnt ? (dup / cnt * 100) : 0; const pctSim = cnt ? (sim / cnt * 100) : 0;
    const verdict = mean >= 0.5 ? '🔴 嚴重模板化' : mean >= 0.35 ? '🟠 高度相似' : mean >= 0.22 ? '🟡 中度' : '🟢 差異化佳';
    console.log(`${verdict}  ${type}  (${list.length} 篇)`);
    console.log(`    平均相似度 ${mean.toFixed(3)} / 中位 ${med.toFixed(3)} / 最高 ${max.toFixed(3)} ｜ 配對中 ≥0.5: ${pctDup.toFixed(0)}%, 0.35-0.5: ${pctSim.toFixed(0)}%`);
  }

  // show one concrete near-duplicate pair from the worst type
  console.log('\n=== 範例：最嚴重型別的一組近乎重複（不同站、同型別）===');
  const worst = [...byType.entries()].map(([t, l]) => {
    const s = sample(l, 40); s.forEach((a) => (a._sh = shingles(normalizeForSimilarity(a.content || ''))));
    let best = 0, pair = null;
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) { const v = jac(s[i]._sh, s[j]._sh); if (v > best && s[i].siteId !== s[j].siteId) { best = v; pair = [s[i], s[j]]; } }
    return { t, best, pair, n: l.length };
  }).sort((a, b) => b.best - a.best)[0];
  if (worst && worst.pair) {
    console.log(`型別 ${worst.t} ｜ 相似度 ${worst.best.toFixed(3)}`);
    worst.pair.forEach((a, i) => {
      console.log(`\n  [${String.fromCharCode(65 + i)}] 站: ${a.site?.name} ｜ 標題: ${a.title}`);
      console.log('  ' + (a.content || '').replace(/\s+/g, ' ').slice(0, 240));
    });
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
