import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

/**
 * Flatten JSON-LD: extract individual schemas from @graph arrays and nested structures.
 * Handles: standalone schemas, @graph arrays, and arrays of schemas.
 */
function flattenJsonLd(raw: any[]): any[] {
  const result: any[] = [];
  for (const item of raw) {
    if (Array.isArray(item)) {
      result.push(...flattenJsonLd(item));
    } else if (item && typeof item === 'object') {
      if (Array.isArray(item['@graph'])) {
        const ctx = item['@context'];
        for (const node of item['@graph']) {
          result.push({ ...(ctx && !node['@context'] ? { '@context': ctx } : {}), ...node });
        }
      } else {
        result.push(item);
      }
    }
  }
  return result;
}

@Injectable()
export class ParserService {
  load(html: string) {
    return cheerio.load(html);
  }

  getJsonLd($: cheerio.CheerioAPI): any[] {
    const raw: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        raw.push(JSON.parse($(el).html() || ''));
      } catch {}
    });
    return flattenJsonLd(raw);
  }

  getMetaTags($: cheerio.CheerioAPI): Record<string, string> {
    const tags: Record<string, string> = {};
    $('meta').each((_, el) => {
      const name = $(el).attr('name') || $(el).attr('property');
      const content = $(el).attr('content');
      if (name && content) tags[name] = content;
    });
    return tags;
  }

  getOpenGraphTags($: cheerio.CheerioAPI): Record<string, string> {
    const tags: Record<string, string> = {};
    $('meta[property^="og:"]').each((_, el) => {
      const property = $(el).attr('property');
      const content = $(el).attr('content');
      if (property && content) tags[property] = content;
    });
    return tags;
  }

  getTitle($: cheerio.CheerioAPI): string {
    return $('title').text().trim();
  }

  getImages($: cheerio.CheerioAPI): { src: string; alt: string | undefined }[] {
    const images: { src: string; alt: string | undefined }[] = [];
    $('img').each((_, el) => {
      images.push({ src: $(el).attr('src') || '', alt: $(el).attr('alt') });
    });
    return images;
  }

  getFaqSchema($: cheerio.CheerioAPI): any[] {
    const schemas = this.getJsonLd($);
    return schemas.filter(
      (item) => item['@type'] === 'FAQPage' || (Array.isArray(item['@type']) && item['@type'].includes('FAQPage')),
    );
  }
}
