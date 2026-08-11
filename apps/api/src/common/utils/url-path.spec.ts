import { decodeUrlPathSegmentOnce, encodeUrlPathSegmentOnce } from '@geovault/shared';

describe('public URL path segment codec', () => {
  const cjkSlug = '台北婚佈-品牌分析';
  const encodedCjkSlug = encodeURIComponent(cjkSlug);

  it.each([
    [cjkSlug, cjkSlug],
    [encodedCjkSlug, cjkSlug],
    ['ascii-brand-profile', 'ascii-brand-profile'],
  ])('normalizes %s without double decoding', (input, expected) => {
    expect(decodeUrlPathSegmentOnce(input)).toBe(expected);
  });

  it.each([cjkSlug, encodedCjkSlug])('emits exactly one encoded segment for %s', (input) => {
    expect(encodeUrlPathSegmentOnce(input)).toBe(encodedCjkSlug);
  });

  it.each(['%', '%E5%8F', '%2Fadmin', '..', '.', 'a\\b', 'a/b', ''])('rejects unsafe segment %s', (input) => {
    expect(decodeUrlPathSegmentOnce(input)).toBeNull();
    expect(encodeUrlPathSegmentOnce(input)).toBeNull();
  });
});
