import { Injectable, Logger } from '@nestjs/common';
import { IPlatformAdapter } from './adapter.interface';

@Injectable()
export class MediumAdapter implements IPlatformAdapter {
  platform = 'medium';
  private logger = new Logger(MediumAdapter.name);

  async publish(content: { title: string; body: string; tags?: string[] }, config: Record<string, string>): Promise<{ externalUrl: string; externalId: string }> {
    const { title, body, tags } = content;
    const token = config.accessToken;

    // Get user ID
    const userRes = await fetch('https://api.medium.com/v1/me', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const userData = await userRes.json() as any;
    const userId = userData.data.id;

    // Create post
    const postRes = await fetch(`https://api.medium.com/v1/users/${userId}/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        contentFormat: 'markdown',
        content: body,
        tags: tags || [],
        publishStatus: 'draft',
      }),
    });

    const postData = await postRes.json() as any;
    this.logger.log(`Published to Medium: ${postData.data.url}`);

    return { externalUrl: postData.data.url, externalId: postData.data.id };
  }
}
