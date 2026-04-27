/**
 * Find distinctive niche keywords by intersecting a curated per-industry
 * dictionary with the brand's official description.
 *
 *   description = "...專業、有信譽、透明、技術優良的脊椎整復品牌！"
 *   industry    = "traditional_medicine"
 *   → returns ["脊椎"]
 *
 * Why a curated dictionary instead of regex tokenization: Chinese has no
 * word boundaries. A 2-4 char regex window over CJK runs yields garbage
 * like "復品牌" or "的脊椎整" — sliding fragments that are useless to
 * enforce. A per-industry dictionary avoids this entirely: we know what
 * niche terms are meaningful for each vertical and just check membership.
 *
 * Dictionary growth strategy: when a new industry / brand surfaces a niche
 * term we want enforced, add it here. Cheap to extend, no NLP dependency.
 */

const NICHE_DICTIONARY: Record<string, string[]> = {
  traditional_medicine: [
    '脊椎', '脊療', '筋膜', '整骨', '運動傷害', '復健', '姿勢', '骨盆',
    '經絡', '推拿', '撥筋', '徒手', '深層', '矯正',
  ],
  healthcare: [
    '復健', '慢性病', '預防', '長照', '居家照護', '運動處方', '飲食',
  ],
  dental: [
    '隱適美', '齒列', '矯正', '植牙', '美白', '貼片', '根管', '兒童牙科',
  ],
  beauty_salon: [
    '頭皮', '染髮', '燙髮', '挑染', '冷塑燙', '剪髮', '護髮', '頭皮養護',
  ],
  auto_care: [
    '鍍膜', '拋光', '打蠟', 'DIY', '車漆', '內裝', '清潔劑', '釉膜', '玻璃膜',
  ],
  restaurant: [
    '無菜單', '居酒屋', '單點', '套餐', '私廚', '燒肉', '壽司', '懷石',
  ],
  cafe: [
    '手沖', '單品', '淺焙', '深焙', '烘豆', '拿鐵', '甜點',
  ],
  fitness: [
    '私人教練', '一對一', '增肌', '減脂', '功能性', '皮拉提斯', '瑜珈',
  ],
};

// Cross-industry fallback for terms that are unambiguously niche regardless
// of the brand's classified industry (these almost never appear in generic
// industry-wide copy, so they're safe to enforce when found).
const CROSS_NICHE_TERMS = [
  '脊椎', '鍍膜', '隱適美', '無菜單', '手沖', '皮拉提斯',
];

export function extractNicheKeywords(
  description: string | undefined,
  site: { name: string; industry?: string | null },
): string[] {
  if (!description || description === '(無)') return [];

  const candidates = new Set<string>();
  const dict = (site.industry && NICHE_DICTIONARY[site.industry]) || [];
  for (const term of dict) {
    if (description.includes(term) && !site.name.includes(term)) {
      candidates.add(term);
    }
  }
  for (const term of CROSS_NICHE_TERMS) {
    if (description.includes(term) && !site.name.includes(term)) {
      candidates.add(term);
    }
  }

  // Cap to 3 to avoid over-constraining the LLM.
  return Array.from(candidates).slice(0, 3);
}
