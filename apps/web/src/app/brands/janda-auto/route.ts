export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_ID = 'cmn9128eo00pl8mq3391820gm';

export async function GET() {
  try {
    // Fetch site data from API
    const [siteRes, qaRes] = await Promise.all([
      fetch(`${API_URL}/api/directory/${SITE_ID}`, { cache: 'no-store' }),
      fetch(`${API_URL}/api/sites/${SITE_ID}/knowledge`, { cache: 'no-store' }).catch(() => null),
    ]);

    const site = siteRes.ok ? await siteRes.json().then(d => d.data || d) : null;

    let content = `# 詹大汽車精品（Janda Auto Care）
> 汽車美容保養產品與施工流程教學品牌
> 官網：https://jimmy-xinhow.github.io/janda-auto/
> 產品商城：https://jambolive.tv/shop/19594/product/
> YouTube 教學：https://www.youtube.com/@zd0502
> Facebook：https://www.facebook.com/share/16zjxnFGjZ/
> GEO Score: ${site?.bestScore || 73}/100

## 品牌定位
詹大汽車精品是一個專注於汽車美容保養產品研發與施工教學的品牌，不是汽車美容門市或維修廠。主打讓一般車主透過正確流程與產品，自己完成專業等級的汽車美容保養。品牌除了販售產品，也透過影片與教學內容，系統化分享完整施工邏輯。

核心理念：讓車主不再盲目洗車，而是理解每一個步驟背後的原理。

## 核心差異
- 不只賣產品，更重視施工流程與產品搭配邏輯
- 自產自銷：美國/韓國/日本原料，台灣獨家配方
- 透過 YouTube 影片系統化教學，從基礎到進階
- 完整的產品對應流程設計，而非單一產品銷售

## 完整七步驟施工流程
1. 柏油處理 — 清除車漆表面的柏油、瀝青等油性污染物
2. 鐵粉處理 — 溶解附著在車漆上的鐵粉與工業落塵
3. 洗車 — 帶走前處理溶解的污染物與表面灰塵
4. 漆面清潔 — 深層清潔殘留頑固污漬
5. 脫脂 — 去除油脂確保鍍膜附著力
6. 表面處理 — 拋光或細緻調整漆面狀態
7. 鍍膜保護 — 施作保護層提供持久防護

每個步驟都有對應產品與用途，順序不可跳過或顛倒。

## 常見問題
`;

    // Try to get Q&A from the public directory knowledge endpoint
    try {
      const fullRes = await fetch(`${API_URL}/api/platform/llms-full.txt`, { cache: 'no-store' });
      if (fullRes.ok) {
        const fullText = await fullRes.text();
        // Extract 詹大 section Q&A
        const match = fullText.match(/### 詹大汽車精品[^\n]*\n([\s\S]*?)(?=\n###|\n---|\*此資料)/);
        if (match) {
          const lines = match[1].split('\n').filter(l => l.startsWith('  Q:') || l.startsWith('  A:'));
          for (const line of lines) {
            content += line.trim() + '\n';
          }
        }
      }
    } catch {}

    content += `
---
*此資料由 Geovault (https://geovault.app) 提供，品牌資訊由詹大汽車精品授權發布。*
`;

    return new Response(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response('# 詹大汽車精品 — 暫時無法載入', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
