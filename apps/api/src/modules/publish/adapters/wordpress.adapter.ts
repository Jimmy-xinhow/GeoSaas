import { Injectable, Logger } from '@nestjs/common';
import { IPlatformAdapter } from './adapter.interface';

@Injectable()
export class WordPressAdapter implements IPlatformAdapter {
  platform = 'wordpress';
  private logger = new Logger(WordPressAdapter.name);

  async publish(content: { title: string; body: string; tags?: string[] }, config: Record<string, string>): Promise<{ externalUrl: string; externalId: string }> {
    const { title, body } = content;
    const { siteUrl, username, appPassword } = config;

    const apiUrl = `${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
    const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        content: body,
        status: 'draft',
      }),
    });

    const postData = await res.json() as any;
    this.logger.log(`Published to WordPress: ${postData.link}`);

    return { externalUrl: postData.link || '', externalId: String(postData.id || '') };
  }
}
