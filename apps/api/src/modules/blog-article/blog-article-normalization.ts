import { createHash } from 'crypto';
import { toPlainTextExcerpt } from '../../common/utils/plain-text';

export interface BlogArticleIdentityInput {
  siteId?: string | null;
  title?: string | null;
  templateType?: string | null;
  category?: string | null;
  contentIntent?: string | null;
}

export function normalizeBlogArticleTitle(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-TW')
    .replace(/[\p{P}\p{S}\s]+/gu, '')
    .trim();
}

export function resolveBlogArticleIntent(input: BlogArticleIdentityInput): string {
  return String(input.contentIntent || input.templateType || input.category || 'article')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

export function buildBlogArticleContentKey(input: BlogArticleIdentityInput): string | null {
  const normalizedTitle = normalizeBlogArticleTitle(input.title);
  if (!normalizedTitle) return null;
  const scope = input.siteId || 'platform';
  const intent = resolveBlogArticleIntent(input);
  return createHash('sha256')
    .update(`${scope}\u0000${intent}\u0000${normalizedTitle}`)
    .digest('hex');
}

export function normalizeBlogArticleDescription(value: string | null | undefined): string {
  return toPlainTextExcerpt(value, 160);
}
