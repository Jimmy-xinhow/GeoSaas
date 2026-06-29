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
const SIZE = 4;
function shingles(norm) { const s = new Set(); if (norm.length < SIZE) { if (norm.length) s.add(norm); return s; } for (let i = 0; i <= norm.length - SIZE; i++) s.add(norm.slice(i, i + SIZE)); return s; }
function jac(a, b) { if (!a.size || !b.size) return 0; const [s, l] = a.size <= b.size ? [a, b] : [b, a]; let n = 0; for (const g of s) if (l.has(g)) n++; return n / (a.size + b.size - n); }
function sample(arr, k) { if (arr.length <= k) return arr.slice(); const step = arr.length / k; const out = []; for (let i = 0; i < k; i++) out.push(arr[Math.floor(i * step)]); return out; }
// strip brand name + all digits/scores → leaves the reusable skeleton prose
function skeleton(content, siteName) {
  let t = (content || '');
  if (siteName) { try { t = t.split(siteName).join(''); } catch {} }
  return t.toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/[^\s)]+/g, ' ')
    .replace(/[0-9]+/g, '')                 // drop all numbers/scores/percent
    .replace(/[^㐀-鿿 a-z]/g, '')   // keep CJK + latin only
    .replace(/\s+/g, '');
}
function headings(content) { return (content || '').split('\n').filter((l) => /^#{1,4}\s/.test(l)).map((l) => l.replace(/^#+\s/, '').replace(/[0-9]/g, '#').trim()); }

(async () => {
  const prisma = new PrismaClient();
  const arts = await prisma.blogArticle.findMany({
    where: { published: true },
    select: { id: true, title: true, content: true, templateType: true, siteId: true, site: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const byType = new Map();
  for (const a of arts) { if (!byType.has(a.templateType)) byType.set(a.templateType, []); byType.get(a.templateType).push(a); }

  console.log('\n=== 模板化稽核：去品牌名+去數字後的「骨架相似度」 + 標題結構重疊 ===');
  console.log('骨架相似度 ≥0.6 = 同一套罐頭文；標題結構若幾乎全同 = 版型完全一致\n');
  const SN = 60;
  for (const [type, list] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const s = sample(list, SN);
    s.forEach((a) => { a._sk = shingles(skeleton(a.content, a.site?.name)); a._hd = headings(a.content).join(' | '); });
    let sum = 0, cnt = 0, ge6 = 0, ge75 = 0;
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) { const v = jac(s[i]._sk, s[j]._sk); sum += v; cnt++; if (v >= 0.6) ge6++; if (v >= 0.75) ge75++; }
    const mean = cnt ? sum / cnt : 0;
    // heading-structure identity: how many share the single most-common heading signature
    const hcount = {}; s.forEach((a) => (hcount[a._hd] = (hcount[a._hd] || 0) + 1));
    const top = Object.entries(hcount).sort((a, b) => b[1] - a[1])[0];
    const topPct = top ? (top[1] / s.length * 100) : 0;
    const verdict = mean >= 0.75 ? '🔴 幾乎同一篇' : mean >= 0.6 ? '🔴 嚴重模板化' : mean >= 0.45 ? '🟠 明顯模板' : mean >= 0.3 ? '🟡 中度' : '🟢 OK';
    console.log(`${verdict}  ${type} (${list.length} 篇)`);
    console.log(`    骨架相似度 平均 ${mean.toFixed(3)} ｜ 配對 ≥0.6: ${(ge6 / cnt * 100).toFixed(0)}%, ≥0.75: ${(ge75 / cnt * 100).toFixed(0)}%`);
    console.log(`    標題版型: ${topPct.toFixed(0)}% 的文章用完全相同的標題結構（共 ${Object.keys(hcount).length} 種版型/抽樣${s.length}篇）`);
    if (topPct >= 50 && top) console.log(`    主版型標題序: ${top[0].slice(0, 160)}`);
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
