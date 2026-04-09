import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Geovault — 讓 AI 主動推薦你的品牌';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #111827 0%, #1e3a5f 50%, #111827 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          color: 'white',
          padding: '60px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              fontWeight: 'bold',
            }}
          >
            G
          </div>
          <span style={{ fontSize: '42px', fontWeight: 'bold' }}>Geovault</span>
        </div>
        <div
          style={{
            fontSize: '48px',
            fontWeight: 'bold',
            textAlign: 'center',
            lineHeight: 1.3,
            maxWidth: '900px',
          }}
        >
          讓 AI 主動推薦你的品牌
        </div>
        <div
          style={{
            fontSize: '24px',
            color: '#93c5fd',
            marginTop: '20px',
            textAlign: 'center',
          }}
        >
          ChatGPT · Claude · Perplexity · Gemini · Copilot
        </div>
        <div
          style={{
            fontSize: '18px',
            color: '#6b7280',
            marginTop: '32px',
          }}
        >
          APAC #1 GEO 優化平台 · www.geovault.app
        </div>
      </div>
    ),
    { ...size },
  );
}
