import { Injectable } from '@nestjs/common';

@Injectable()
export class LlmsTxtGenerator {
  generate(data: { title: string; description: string; url: string; links?: { title: string; url: string }[] }): string {
    const lines: string[] = [];
    lines.push(`# ${data.title}`);
    lines.push('');
    lines.push(`> ${data.description}`);
    lines.push('');
    lines.push(`Website: ${data.url}`);
    lines.push('');

    if (data.links && data.links.length > 0) {
      lines.push('## Important Pages');
      lines.push('');
      data.links.forEach((link) => {
        lines.push(`- [${link.title}](${link.url})`);
      });
    }

    return lines.join('\n');
  }
}
