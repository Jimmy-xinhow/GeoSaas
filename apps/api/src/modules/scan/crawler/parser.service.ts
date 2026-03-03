import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

@Injectable()
export class ParserService {
  load(html: string) {
    return cheerio.load(html);
  }

  getJsonLd($: cheerio.CheerioAPI): any[] {
    const results: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        results.push(JSON.parse($(el).html() || ''));
      } catch {}
    });
    return results;
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
    const jsonLd = this.getJsonLd($);
    return jsonLd.filter(
      (item) => item['@type'] === 'FAQPage' || (Array.isArray(item['@type']) && item['@type'].includes('FAQPage')),
    );
  }
}
