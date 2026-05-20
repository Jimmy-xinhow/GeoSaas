export const AFFILIATE_TIERS = {
  standard: { rate: 10, label: '標準' },
  gold: { rate: 15, label: '金牌' },
  platinum: { rate: 20, label: '白金' },
} as const;

export type AffiliateTier = keyof typeof AFFILIATE_TIERS;

export const AFFILIATE_CONFIG = {
  applicationEnabled: true,
  autoApproveApplications: false,
  defaultCommissionRate: AFFILIATE_TIERS.standard.rate as number,
  cookieWindowDays: 30,
  minWithdrawalAmount: 1000,
  commissionLockDays: 14,
  allowBankTransfer: true,
  allowPlatformCredits: true,
  clickDedupeWindowSeconds: 3600,
  annualTaxThreshold: 20000,
  programTerms:
    '聯盟夥伴需以合法、透明、不誤導的方式推廣 Geovault。佣金於付款完成並通過鎖定期後可申請提領，若訂單退款或有濫用情形，平台保留撤銷佣金資格。',
  landingPageIntro:
    '推薦客戶使用 Geovault 完成 GEO 掃描、AI 引用優化與內容資產建置，即可依成交方案取得分潤。',
};

export type AffiliateProgramSettings = typeof AFFILIATE_CONFIG & {
  tierRates: Record<AffiliateTier, number>;
};

export const DEFAULT_AFFILIATE_SETTINGS: AffiliateProgramSettings = {
  ...AFFILIATE_CONFIG,
  tierRates: {
    standard: AFFILIATE_TIERS.standard.rate,
    gold: AFFILIATE_TIERS.gold.rate,
    platinum: AFFILIATE_TIERS.platinum.rate,
  },
};

export function getAffiliateTierRate(
  tier: string,
  settings: AffiliateProgramSettings = DEFAULT_AFFILIATE_SETTINGS,
): number {
  return settings.tierRates[tier as AffiliateTier] ?? settings.defaultCommissionRate;
}
