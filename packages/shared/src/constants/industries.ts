export const INDUSTRIES = [
  { value: 'restaurant', label: '餐飲' },
  { value: 'hospitality', label: '住宿' },
  { value: 'retail', label: '零售' },
  { value: 'technology', label: '科技' },
  { value: 'healthcare', label: '醫療' },
  { value: 'education', label: '教育' },
  { value: 'finance', label: '金融' },
  { value: 'real_estate', label: '不動產' },
  { value: 'professional_services', label: '專業服務' },
  { value: 'manufacturing', label: '製造業' },
  { value: 'media', label: '媒體' },
  { value: 'nonprofit', label: '非營利' },
  { value: 'other', label: '其他' },
] as const;

export type IndustryValue = (typeof INDUSTRIES)[number]['value'];
