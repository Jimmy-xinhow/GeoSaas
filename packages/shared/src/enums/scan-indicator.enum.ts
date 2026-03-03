export enum ScanIndicator {
  JSON_LD = 'json_ld',
  LLMS_TXT = 'llms_txt',
  OG_TAGS = 'og_tags',
  META_DESCRIPTION = 'meta_description',
  FAQ_SCHEMA = 'faq_schema',
  TITLE_OPTIMIZATION = 'title_optimization',
  CONTACT_INFO = 'contact_info',
  IMAGE_ALT = 'image_alt',
}

export const ScanIndicatorLabel: Record<ScanIndicator, string> = {
  [ScanIndicator.JSON_LD]: 'JSON-LD 結構化資料',
  [ScanIndicator.LLMS_TXT]: 'llms.txt',
  [ScanIndicator.OG_TAGS]: 'Open Graph 標籤',
  [ScanIndicator.META_DESCRIPTION]: 'Meta Description',
  [ScanIndicator.FAQ_SCHEMA]: 'FAQ Schema',
  [ScanIndicator.TITLE_OPTIMIZATION]: '頁面標題優化',
  [ScanIndicator.CONTACT_INFO]: '聯絡資訊完整度',
  [ScanIndicator.IMAGE_ALT]: '圖片 ALT 標籤',
};
