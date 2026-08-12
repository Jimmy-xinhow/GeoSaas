/**
 * JSON-LD is embedded inside a script element. Escaping "<" prevents dynamic
 * content such as a brand name containing "</script>" from terminating that
 * element and being interpreted as HTML.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
