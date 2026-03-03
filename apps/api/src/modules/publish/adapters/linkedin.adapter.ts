import { Injectable, Logger } from '@nestjs/common';
import { IPlatformAdapter } from './adapter.interface';

@Injectable()
export class LinkedInAdapter implements IPlatformAdapter {
  platform = 'linkedin';
  private logger = new Logger(LinkedInAdapter.name);

  async publish(content: { title: string; body: string; tags?: string[] }, config: Record<string, string>): Promise<{ externalUrl: string; externalId: string }> {
    const { title, body } = content;
    const token = config.accessToken;

    // Get user profile URN
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const profile = await profileRes.json() as any;
    const authorUrn = `urn:li:person:${profile.sub}`;

    // Create article post via UGC API
    const postRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: `${title}\n\n${body.substring(0, 1300)}` },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    });

    const postData = await postRes.json() as any;
    const postId = postData.id || '';
    const externalUrl = `https://www.linkedin.com/feed/update/${postId}`;
    this.logger.log(`Published to LinkedIn: ${externalUrl}`);

    return { externalUrl, externalId: postId };
  }
}
