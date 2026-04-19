import { Injectable, Logger } from '@nestjs/common';
import { IPlatformAdapter } from './adapter.interface';

@Injectable()
export class FacebookAdapter implements IPlatformAdapter {
  platform = 'facebook';
  private logger = new Logger(FacebookAdapter.name);

  async publish(
    content: { title: string; body: string; tags?: string[] },
    config: Record<string, string>,
  ): Promise<{ externalUrl: string; externalId: string }> {
    const token = config.accessToken;
    const pageId = config.pageId;

    if (!token || !pageId) {
      this.logger.warn('FACEBOOK_ACCESS_TOKEN or FACEBOOK_PAGE_ID not configured');
      return { externalUrl: '', externalId: `fb-draft-${Date.now()}` };
    }

    // Facebook Graph API: POST /{page-id}/feed
    const message = `${content.title}\n\n${content.body.slice(0, 1500)}`;
    const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        access_token: token,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Facebook publish failed (${res.status}): ${text.slice(0, 200)}`);
      return { externalUrl: '', externalId: `fb-failed-${Date.now()}` };
    }

    const data = (await res.json()) as any;
    const postId = data.id;
    this.logger.log(`Published to Facebook: ${postId}`);
    return {
      externalUrl: `https://www.facebook.com/${postId}`,
      externalId: postId,
    };
  }
}
