import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private readonly fromEmail: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
    this.fromEmail = this.config.get<string>('EMAIL_FROM', 'Geovault <noreply@geovault.app>');
  }

  /** Send scan complete notification */
  async sendScanComplete(to: string, data: { siteName: string; score: number; url: string }) {
    return this.send({
      to,
      subject: `掃描完成 — ${data.siteName} GEO 分數：${data.score}/100`,
      html: `
        <h2>${data.siteName} 掃描完成</h2>
        <p>您的網站 <strong>${data.siteName}</strong> 的 GEO 掃描已完成。</p>
        <p style="font-size: 48px; font-weight: bold; color: ${data.score >= 80 ? '#22c55e' : data.score >= 60 ? '#3b82f6' : '#ef4444'};">${data.score}/100</p>
        <p><a href="https://geovault.app/sites/${data.url}" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">查看詳細報告</a></p>
        <hr/>
        <p style="color: #9ca3af; font-size: 12px;">Geovault — The APAC Authority on AI Search Optimization</p>
      `,
    });
  }

  /** Send badge earned notification */
  async sendBadgeEarned(to: string, data: { siteName: string; badgeLabel: string }) {
    return this.send({
      to,
      subject: `恭喜！${data.siteName} 獲得「${data.badgeLabel}」徽章`,
      html: `
        <h2>🏅 新徽章解鎖！</h2>
        <p>您的網站 <strong>${data.siteName}</strong> 獲得了 <strong>「${data.badgeLabel}」</strong> 徽章。</p>
        <p><a href="https://geovault.app" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">前往查看</a></p>
        <hr/>
        <p style="color: #9ca3af; font-size: 12px;">Geovault — The APAC Authority on AI Search Optimization</p>
      `,
    });
  }

  /** Send monitor change notification */
  async sendMonitorChange(to: string, data: { changes: string }) {
    return this.send({
      to,
      subject: 'AI 引用變動通知 — Geovault',
      html: `
        <h2>AI 引用變動通知</h2>
        <p>${data.changes}</p>
        <p><a href="https://geovault.app/monitor" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">查看監控儀表板</a></p>
        <hr/>
        <p style="color: #9ca3af; font-size: 12px;">Geovault — The APAC Authority on AI Search Optimization</p>
      `,
    });
  }

  /** Send welcome email */
  async sendWelcome(to: string, name: string) {
    return this.send({
      to,
      subject: '歡迎加入 Geovault！',
      html: `
        <h2>歡迎加入 Geovault，${name}！</h2>
        <p>感謝您註冊 Geovault — APAC 領先的 AI 搜尋優化平台。</p>
        <h3>接下來你可以：</h3>
        <ol>
          <li>🔍 免費掃描您的網站 AI 能見度</li>
          <li>🔧 根據建議自動修復問題</li>
          <li>📊 追蹤 AI 爬蟲造訪紀錄</li>
          <li>📈 監控 ChatGPT、Claude、Copilot 等 AI 引用狀態</li>
        </ol>
        <p><a href="https://geovault.app/dashboard" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">開始使用</a></p>
        <hr/>
        <p style="color: #9ca3af; font-size: 12px;">Geovault — The APAC Authority on AI Search Optimization</p>
      `,
    });
  }

  private async send(params: { to: string; subject: string; html: string }) {
    if (!this.resend) {
      this.logger.warn('Resend not configured (RESEND_API_KEY missing), skipping email');
      return;
    }

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      this.logger.log(`Email sent to ${params.to}: ${params.subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${params.to}: ${err}`);
    }
  }
}
