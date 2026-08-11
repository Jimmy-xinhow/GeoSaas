/**
 * Normalize one dynamic URL path segment without double-decoding it.
 *
 * Next.js and edge runtimes may expose a route parameter either decoded or
 * with one layer of percent encoding. Geovault slugs never contain literal
 * percent escapes, separators, NULs, or dot-segments, so ambiguous values are
 * rejected instead of being forwarded to an upstream API.
 */
export function decodeUrlPathSegmentOnce(value: string): string | null {
  if (!value) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }

  if (
    !decoded ||
    decoded === '.' ||
    decoded === '..' ||
    decoded.includes('/') ||
    decoded.includes('\\') ||
    decoded.includes('\0')
  ) {
    return null;
  }

  return decoded;
}

/** Return exactly one percent-encoded representation of a safe segment. */
export function encodeUrlPathSegmentOnce(value: string): string | null {
  const decoded = decodeUrlPathSegmentOnce(value);
  return decoded == null ? null : encodeURIComponent(decoded);
}
