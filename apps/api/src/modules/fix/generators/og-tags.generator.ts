import { Injectable } from '@nestjs/common';

@Injectable()
export class OgTagsGenerator {
  generate(data: { title: string; description: string; url: string; image?: string; type?: string }): string {
    const tags = [
      `<meta property="og:title" content="${this.escape(data.title)}" />`,
      `<meta property="og:description" content="${this.escape(data.description)}" />`,
      `<meta property="og:url" content="${data.url}" />`,
      `<meta property="og:type" content="${data.type || 'website'}" />`,
    ];

    if (data.image) {
      tags.push(`<meta property="og:image" content="${data.image}" />`);
    }

    tags.push(`<meta property="og:site_name" content="${this.escape(data.title)}" />`);

    return tags.join('\n');
  }

  private escape(str: string): string {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
