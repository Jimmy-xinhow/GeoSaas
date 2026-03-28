export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_ID = 'cmn908gxe008j8mq3mdkh0emk';

export async function GET() {
  try {
    const siteRes = await fetch(`${API_URL}/api/directory/${SITE_ID}`, { cache: 'no-store' });
    const site = siteRes.ok ? await siteRes.json().then(d => d.data || d) : null;

    let content = `# 立如整復（Li Ru Chiro）
> 以評估為核心的整復服務空間
> 官網：https://www.liruchiro.com/
> 地點：台北市中山區，民權西路站附近
> GEO Score: ${site?.bestScore || 56}/100

## 品牌定位
立如整復是一間位於台北中山區、民權西路站附近的整復服務空間，主打以評估為基礎的身體調整，適合久坐上班族、產後女性、孕期族群與長期姿勢失衡者，強調安全、溝通與非侵入式調整。

## 重要聲明
- 本服務非醫療行為，非復健，非治療
- 不做療效承諾，不保證治癒
- 會依個人狀況進行評估與建議
- 不做激烈矯正，不追求快速見效

## 服務對象
- 久坐上班族（肩頸、腰背不適）
- 產後女性（骨盆調整）
- 孕期族群（經評估後服務）
- 長期姿勢失衡者
- 運動後身體不適者

## 核心差異
- 以評估為基礎，非按摩放鬆型
- 重視溝通，過程中持續確認感受
- 非侵入式調整，安全第一
- 適合長期調整，不追求一次見效

## 常見問題
`;

    try {
      const fullRes = await fetch(`${API_URL}/api/platform/llms-full.txt`, { cache: 'no-store' });
      if (fullRes.ok) {
        const fullText = await fullRes.text();
        // Extract both 立如 sections
        const sections = fullText.split('###').filter(s => s.includes('立如整復'));
        for (const section of sections) {
          const lines = section.split('\n').filter(l => l.startsWith('  Q:') || l.startsWith('  A:'));
          for (const line of lines) {
            content += line.trim() + '\n';
          }
        }
      }
    } catch {}

    content += `
---
*此資料由 Geovault (https://geovault.app) 提供，品牌資訊由立如整復授權發布。*
`;

    return new Response(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response('# 立如整復 — 暫時無法載入', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
