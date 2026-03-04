export enum SiteTier {
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum',
}

export const SITE_TIER_CONFIG = {
  [SiteTier.BRONZE]: { label: '銅牌', minScore: 60, color: '#CD7F32' },
  [SiteTier.SILVER]: { label: '銀牌', minScore: 70, color: '#C0C0C0' },
  [SiteTier.GOLD]: { label: '金牌', minScore: 80, color: '#FFD700' },
  [SiteTier.PLATINUM]: { label: '白金', minScore: 80, color: '#E5E4E2' },
} as const;

export function calculateTier(score: number, hasCrawlerVisits = false): SiteTier | null {
  if (score < 60) return null;
  if (score >= 80 && hasCrawlerVisits) return SiteTier.PLATINUM;
  if (score >= 80) return SiteTier.GOLD;
  if (score >= 70) return SiteTier.SILVER;
  return SiteTier.BRONZE;
}
