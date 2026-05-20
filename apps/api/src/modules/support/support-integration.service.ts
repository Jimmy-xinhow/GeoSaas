import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupportConversationRow } from './support.service';

@Injectable()
export class SupportIntegrationService {
  private readonly logger = new Logger(SupportIntegrationService.name);

  constructor(private readonly config: ConfigService) {}

  async notifyNewUserMessage(conversation: SupportConversationRow, body: string): Promise<void> {
    const message = [
      'Geovault 新客服對話',
      `ID: ${conversation.id}`,
      `標題: ${conversation.subject}`,
      `方案: ${conversation.planSnapshot}`,
      `優先級: ${conversation.priority}`,
      `用戶: ${conversation.userName || conversation.userEmail || conversation.userId}`,
      conversation.siteName ? `網站: ${conversation.siteName}` : undefined,
      '',
      body.slice(0, 1200),
      '',
      `Telegram 回覆: /reply ${conversation.id} 回覆內容`,
      `Lark 回覆: #${conversation.id} 回覆內容`,
    ].filter((line) => line !== undefined).join('\n');

    await Promise.allSettled([
      this.notifyTelegram(message),
      this.notifyLark(message),
    ]);
  }

  async notifyExternalReply(conversation: SupportConversationRow, body: string): Promise<void> {
    const message = [
      'Geovault 客服已回覆',
      `ID: ${conversation.id}`,
      `標題: ${conversation.subject}`,
      '',
      body.slice(0, 1200),
    ].join('\n');

    await Promise.allSettled([
      this.notifyTelegram(message),
      this.notifyLark(message),
    ]);
  }

  verifyTelegramSecret(token?: string): boolean {
    const expected = this.config.get<string>('SUPPORT_TELEGRAM_WEBHOOK_SECRET');
    if (!expected) return false;
    return token === expected;
  }

  verifyLarkSecret(token?: string): boolean {
    const expected = this.config.get<string>('SUPPORT_LARK_WEBHOOK_SECRET');
    if (!expected) return false;
    return token === expected;
  }

  parseReplyCommand(text: string | undefined): { conversationId: string; body: string } | null {
    if (!text) return null;
    const trimmed = text.trim();
    const slash = trimmed.match(/^\/reply\s+([a-zA-Z0-9_-]+)\s+([\s\S]+)$/);
    if (slash) return { conversationId: slash[1], body: slash[2].trim() };
    const hash = trimmed.match(/^#([a-zA-Z0-9_-]+)\s+([\s\S]+)$/);
    if (hash) return { conversationId: hash[1], body: hash[2].trim() };
    return null;
  }

  extractTelegramText(payload: any): string | undefined {
    return payload?.message?.text || payload?.edited_message?.text || payload?.channel_post?.text;
  }

  extractLarkText(payload: any): string | undefined {
    if (payload?.event?.message?.content) return this.parseLarkContent(payload.event.message.content);
    if (payload?.message?.content) return this.parseLarkContent(payload.message.content);
    return payload?.text;
  }

  private parseLarkContent(value: string): string {
    try {
      const parsed = JSON.parse(value);
      return parsed.text || value;
    } catch {
      return value;
    }
  }

  private async notifyTelegram(text: string): Promise<void> {
    const token = this.config.get<string>('SUPPORT_TELEGRAM_BOT_TOKEN');
    const chatId = this.config.get<string>('SUPPORT_TELEGRAM_CHAT_ID');
    if (!token || !chatId) return;

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Telegram support notification failed: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      this.logger.warn(`Telegram support notification error: ${err}`);
    }
  }

  private async notifyLark(text: string): Promise<void> {
    const webhookUrl = this.config.get<string>('SUPPORT_LARK_WEBHOOK_URL');
    if (!webhookUrl) return;

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: { text },
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Lark support notification failed: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      this.logger.warn(`Lark support notification error: ${err}`);
    }
  }
}
