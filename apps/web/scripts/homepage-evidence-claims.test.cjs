const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const homeClientSource = fs.readFileSync(
  path.join(__dirname, '../src/app/home-client.tsx'),
  'utf8',
);
const homePageSource = fs.readFileSync(
  path.join(__dirname, '../src/app/page.tsx'),
  'utf8',
);
const rootLayoutSource = fs.readFileSync(
  path.join(__dirname, '../src/app/layout.tsx'),
  'utf8',
);
const publicClaimSources = [
  '../src/app/feed/route.ts',
  '../src/app/feed.json/route.ts',
  '../src/app/humans.txt/route.ts',
  '../src/app/opengraph-image.tsx',
  '../../api/src/modules/email/email.service.ts',
  '../../api/src/modules/news/news-generator.service.ts',
].map((relativeFile) => fs.readFileSync(path.join(__dirname, relativeFile), 'utf8'));

test('homepage success cases come from the evidence-gated API', () => {
  assert.match(homePageSource, /\/api\/success-cases\/featured/);
  assert.match(homePageSource, /featuredCases=\{featuredCases\}/);
  assert.match(homeClientSource, /featuredCases\.length > 0/);
  assert.match(homeClientSource, /目前沒有通過公開證據門檻的案例/);
});

test('homepage does not publish the former simulated brands as success cases', () => {
  const simulatedBrands = [
    '立如整復',
    '詹大汽車精品',
    '森林咖啡工坊',
    '慕光髮藝',
    '鐵人健身工廠',
    '毛孩星球',
  ];

  for (const brand of simulatedBrands) {
    assert.equal(homeClientSource.includes(brand), false, brand);
  }
  assert.equal(homeClientSource.includes('real + simulated'), false);
});

test('homepage metadata and CTA avoid unsupported market leadership or recommendation guarantees', () => {
  const combinedSource = [
    homeClientSource,
    homePageSource,
    rootLayoutSource,
    ...publicClaimSources,
  ].join('\n');
  const unsupportedClaims = [
    '#1 GEO',
    'APAC #1',
    'APAC Authority',
    'APAC 領先',
    '每天數百萬次推薦機會',
    '下一個被 AI 推薦的',
    '被台灣品牌信賴的 GEO 平台',
    '讓品牌被 AI 主動推薦',
    '不被推薦 = 不存在',
  ];

  for (const claim of unsupportedClaims) {
    assert.equal(combinedSource.includes(claim), false, claim);
  }
});
