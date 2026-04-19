import { Injectable, Logger } from '@nestjs/common';
import { IPlatformAdapter } from './adapter.interface';

@Injectable()
export class GoogleBusinessAdapter implements IPlatformAdapter {
  platform = 'google_business';
  private logger = new Logger(GoogleBusinessAdapter.name);

  async publish(
    content: { title: string; body: string; tags?: string[] },
    config: Record<string, string>,
  ): Promise<{ externalUrl: string; externalId: string }> {
    const token = config.accessToken;
    const accountId = config.accountId;
    const locationId = config.locationId;

    if (!token || !accountId || !locationId) {
      this.logger.warn('Google Business credentials not configured');
      return { externalUrl: '', externalId: `gbp-draft-${Date.now()}` };
    }

    // Google Business Profile API: POST /accounts/{accountId}/locations/{locationId}/localPosts
    const summary = content.body.slice(0, 1500);
    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/localPosts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          languageCode: 'zh-TW',
          summary,
          topicType: 'STANDARD',
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Google Business publish failed (${res.status}): ${text.slice(0, 200)}`);
      return { externalUrl: '', externalId: `gbp-failed-${Date.now()}` };
    }

    const data = (await res.json()) as any;
    this.logger.log(`Published to Google Business: ${data.name}`);
    return {
      externalUrl: data.searchUrl || '',
      externalId: data.name || `gbp-${Date.now()}`,
    };
  }
}
