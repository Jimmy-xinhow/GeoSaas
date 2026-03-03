import { ScanIndicator } from '../enums';

export const SCAN_WEIGHTS: Record<ScanIndicator, number> = {
  [ScanIndicator.JSON_LD]: 15,
  [ScanIndicator.LLMS_TXT]: 20,
  [ScanIndicator.OG_TAGS]: 10,
  [ScanIndicator.META_DESCRIPTION]: 10,
  [ScanIndicator.FAQ_SCHEMA]: 15,
  [ScanIndicator.TITLE_OPTIMIZATION]: 10,
  [ScanIndicator.CONTACT_INFO]: 10,
  [ScanIndicator.IMAGE_ALT]: 10,
};
