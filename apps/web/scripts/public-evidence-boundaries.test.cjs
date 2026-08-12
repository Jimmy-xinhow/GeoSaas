const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function source(relativeFile) {
  return fs.readFileSync(path.join(__dirname, relativeFile), 'utf8');
}

const directoryPage = source('../src/app/directory/page.tsx');
const directoryClient = source('../src/app/directory/directory-client.tsx');
const casesPage = source('../src/app/cases/page.tsx');
const blogPosts = source('../src/content/blog/posts.ts');
const botDefinitions = source('../../../packages/shared/src/constants/ai-bots.ts');
const jsonLdSerializer = source('../src/lib/json-ld.ts');

test('public directory copy describes a technical score without fake certification or inventory', () => {
  const combined = `${directoryPage}\n${directoryClient}`;

  assert.match(combined, /技術準備度/);
  assert.match(combined, /不代表 AI 平台的推薦或引用機率/);
  assert.equal(combined.includes('AI SEO 優化認證'), false);
  assert.equal(combined.includes('收錄超過 700'), false);
  assert.equal(combined.includes('AI 爬蟲即時動態'), false);
});

test('dynamic directory JSON-LD cannot terminate its script element', () => {
  assert.match(jsonLdSerializer, /JSON\.stringify\(value\)\.replace\(\/<\/g/);
  assert.match(directoryPage, /serializeJsonLd\(itemListJsonLd\)/);
});

test('empty success-case inventory is rendered as an explicit evidence state', () => {
  assert.match(casesPage, /目前公開案例數：0/);
  assert.match(casesPage, /案例庫建置中/);
});

test('crawler guidance separates Google-Extended from HTTP User-Agent detection', () => {
  assert.match(blogPosts, /沒有獨立的 HTTP User-Agent 字串/);
  assert.doesNotMatch(botDefinitions, /name:\s*'Google-Extended'/);
  assert.match(botDefinitions, /robots\.txt control token/);
});

test('GSC-oriented articles link to primary search documentation', () => {
  assert.match(blogPosts, /https:\/\/developers\.google\.com\/search\/docs\/fundamentals\/ai-optimization-guide/);
  assert.match(blogPosts, /https:\/\/developers\.google\.com\/search\/docs\/appearance\/structured-data\/sd-policies/);
  assert.match(blogPosts, /https:\/\/developers\.openai\.com\/api\/docs\/bots/);
});
