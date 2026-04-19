import { Injectable, Logger } from '@nestjs/common';
import { IPlatformAdapter } from './adapter.interface';

@Injectable()
export class VocusAdapter implements IPlatformAdapter {
  platform = 'vocus';
  private logger = new Logger(VocusAdapter.name);

  async publish(
    content: { title: string; body: string; tags?: string[] },
    config: Record<string, string>,
  ): Promise<{ externalUrl: string; externalId: string }> {
    const token = config.accessToken;

    if (!token) {
      this.logger.warn('VOCUS_ACCESS_TOKEN not configured — content generated but not published');
      return { externalUrl: '', externalId: `vocus-draft-${Date.now()}` };
    }

    // Vocus (方格子) API: POST https://api.vocus.cc/api/articles
    const res = await fetch('https://api.vocus.cc/api/articles', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: content.title,
        content: content.body,
        tags: content.tags || [],
        status: 'draft',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Vocus publish failed (${res.status}): ${text.slice(0, 200)}`);
      return { externalUrl: '', externalId: `vocus-failed-${Date.now()}` };
    }

    const data = (await res.json()) as any;
    this.logger.log(`Published to Vocus: ${data.url || data.id}`);
    return { externalUrl: data.url || '', externalId: data.id || `vocus-${Date.now()}` };
  }
}
