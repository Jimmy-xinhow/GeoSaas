import { ScanIndicator } from '../enums';

export const SCAN_SCORE_VERSION = 2;

// Version 2 is a technical-readiness score, not a citation-probability model.
// Keep the weights at exactly 100 so every point has an auditable contribution.
// llms.txt remains an optional emerging convention; it is deliberately lower
// weight than established crawlability, metadata, content, and schema signals.
export const SCAN_WEIGHTS: Record<ScanIndicator, number> = {
  [ScanIndicator.JSON_LD]: 15,
  [ScanIndicator.LLMS_TXT]: 5,
  [ScanIndicator.OG_TAGS]: 10,
  [ScanIndicator.META_DESCRIPTION]: 10,
  [ScanIndicator.FAQ_SCHEMA]: 15,
  [ScanIndicator.TITLE_OPTIMIZATION]: 10,
  [ScanIndicator.CONTACT_INFO]: 10,
  [ScanIndicator.IMAGE_ALT]: 10,
  [ScanIndicator.ROBOTS_AI]: 15,
};
