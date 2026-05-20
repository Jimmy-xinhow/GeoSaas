import { ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AssignSupportConversationDto,
  CreateSupportConversationDto,
  QuerySupportConversationsDto,
  SendSupportMessageDto,
  UpsertSupportKnowledgeDto,
} from './dto/support.dto';
import { SupportIntegrationService } from './support-integration.service';
import { DEFAULT_SUPPORT_KNOWLEDGE, DefaultSupportKnowledgeItem } from './support-knowledge.defaults';
import { SupportRealtimeGateway } from './support-realtime.gateway';

type UserPlan = 'FREE' | 'STARTER' | 'PRO';

export interface SupportConversationRow {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  siteId: string | null;
  siteName: string | null;
  subject: string;
  category: string;
  status: string;
  priority: string;
  channel: string;
  planSnapshot: string;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  lastMessageAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  latestMessage: string | null;
}

export interface SupportMessageRow {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderName: string | null;
  senderRole: string;
  body: string;
  isAi: boolean;
  createdAt: Date;
}

export interface SupportKnowledgeRow {
  id: string;
  title: string;
  category: string;
  question: string | null;
  answer: string;
  tags: string[];
  enabled: boolean;
  priority: number;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportConversationSummaryRow {
  id: string;
  conversationId: string;
  userId: string;
  siteId: string | null;
  category: string;
  summary: string;
  resolution: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SupportService implements OnModuleInit {
  private readonly logger = new Logger(SupportService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: SupportRealtimeGateway,
    private readonly config: ConfigService,
    private readonly integrations: SupportIntegrationService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) this.openai = new OpenAI({ apiKey });
  }

  async onModuleInit() {
    if (this.config.get<string>('SUPPORT_DEFAULT_KNOWLEDGE_ENABLED') === '0') return;
    try {
      const result = await this.seedDefaultKnowledge();
      if (result.created > 0 || result.updated > 0) {
        this.logger.log(
          `Support default knowledge synced: ${result.created} created, ${result.updated} updated`,
        );
      }
    } catch (err) {
      this.logger.warn(`Support default knowledge sync failed: ${err}`);
    }
  }

  async createConversation(userId: string, dto: CreateSupportConversationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, name: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (dto.siteId) await this.assertSiteAccess(userId, undefined, dto.siteId);

    const plan = user.plan as UserPlan;
    const planConfig = this.planConfig(plan);
    const conversationId = randomUUID();
    const messageId = randomUUID();
    const messageBody = dto.message.trim();
    const subject = dto.subject.trim();
    const category = dto.category?.trim() || 'general';

    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        INSERT INTO support_conversations
          (id, user_id, site_id, subject, category, status, priority, channel, plan_snapshot, last_message_at, created_at, updated_at)
        VALUES
          (${conversationId}, ${userId}, ${dto.siteId ?? null}, ${subject}, ${category}, 'waiting_admin', ${planConfig.priority}, ${planConfig.channel}, ${plan}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      this.prisma.$executeRaw`
        INSERT INTO support_messages
          (id, conversation_id, sender_id, sender_role, body, is_ai, created_at)
        VALUES
          (${messageId}, ${conversationId}, ${userId}, 'user', ${messageBody}, false, CURRENT_TIMESTAMP)
      `,
    ]);

    const aiReply = await this.generateAiSupportReply({
      userId,
      conversationId,
      plan,
      category,
      subject,
      body: messageBody,
      siteId: dto.siteId,
    });
    if (aiReply.body) {
      const aiMessage = await this.insertMessage(conversationId, null, 'ai', aiReply.body, true);
      this.realtime.emitConversationUpdated(conversationId, { type: 'message_created' });
      await this.updateConversationAfterMessage(
        conversationId,
        aiReply.requiresHuman ? 'waiting_admin' : 'waiting_user',
      );
    }

    const conversation = await this.getConversationForUser(userId, conversationId);
    await this.integrations.notifyNewUserMessage(conversation, messageBody);
    this.realtime.emitConversationUpdated(conversationId, { type: 'conversation_created' });
    return conversation;
  }

  async listUserConversations(userId: string) {
    const rows = await this.prisma.$queryRaw<SupportConversationRow[]>`
      SELECT
        c.id,
        c.user_id AS "userId",
        u.name AS "userName",
        u.email AS "userEmail",
        c.site_id AS "siteId",
        s.name AS "siteName",
        c.subject,
        c.category,
        c.status,
        c.priority,
        c.channel,
        c.plan_snapshot AS "planSnapshot",
        c.assigned_admin_id AS "assignedAdminId",
        au.name AS "assignedAdminName",
        c.last_message_at AS "lastMessageAt",
        c.closed_at AS "closedAt",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        latest.body AS "latestMessage"
      FROM support_conversations c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN sites s ON s.id = c.site_id
      LEFT JOIN users au ON au.id = c.assigned_admin_id
      LEFT JOIN LATERAL (
        SELECT body FROM support_messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) latest ON true
      WHERE c.user_id = ${userId}
      ORDER BY c.last_message_at DESC
      LIMIT 50
    `;
    return rows;
  }

  async getConversationForUser(userId: string, conversationId: string) {
    const rows = await this.prisma.$queryRaw<SupportConversationRow[]>`
      SELECT
        c.id,
        c.user_id AS "userId",
        u.name AS "userName",
        u.email AS "userEmail",
        c.site_id AS "siteId",
        s.name AS "siteName",
        c.subject,
        c.category,
        c.status,
        c.priority,
        c.channel,
        c.plan_snapshot AS "planSnapshot",
        c.assigned_admin_id AS "assignedAdminId",
        au.name AS "assignedAdminName",
        c.last_message_at AS "lastMessageAt",
        c.closed_at AS "closedAt",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        latest.body AS "latestMessage"
      FROM support_conversations c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN sites s ON s.id = c.site_id
      LEFT JOIN users au ON au.id = c.assigned_admin_id
      LEFT JOIN LATERAL (
        SELECT body FROM support_messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) latest ON true
      WHERE c.id = ${conversationId} AND c.user_id = ${userId}
      LIMIT 1
    `;
    const item = rows[0];
    if (!item) throw new NotFoundException('Support conversation not found');
    return item;
  }

  async getUserMessages(userId: string, conversationId: string) {
    await this.getConversationForUser(userId, conversationId);
    return this.getMessages(conversationId);
  }

  async sendUserMessage(userId: string, conversationId: string, dto: SendSupportMessageDto) {
    const conversation = await this.getConversationForUser(userId, conversationId);
    if (conversation.status === 'closed') throw new ForbiddenException('Conversation is closed');
    const message = await this.insertMessage(conversationId, userId, 'user', dto.body.trim(), false);
    await this.updateConversationAfterMessage(conversationId, 'waiting_admin');
    this.realtime.emitConversationUpdated(conversationId, { type: 'message_created' });
    const aiReply = await this.generateAiSupportReply({
      userId,
      conversationId,
      plan: conversation.planSnapshot as UserPlan,
      category: conversation.category,
      subject: conversation.subject,
      body: dto.body,
      siteId: conversation.siteId ?? undefined,
    });
    if (aiReply.body) {
      const aiMessage = await this.insertMessage(conversationId, null, 'ai', aiReply.body, true);
      await this.updateConversationAfterMessage(
        conversationId,
        aiReply.requiresHuman ? 'waiting_admin' : 'waiting_user',
      );
      this.realtime.emitConversationUpdated(conversationId, { type: 'message_created' });
    }
    const refreshed = await this.getConversationForUser(userId, conversationId);
    await this.integrations.notifyNewUserMessage(refreshed, dto.body.trim());
    return message;
  }

  async listAdminConversations(filters: QuerySupportConversationsDto) {
    const where: Prisma.Sql[] = [];
    if (filters.status) where.push(Prisma.sql`c.status = ${filters.status}`);
    if (filters.priority) where.push(Prisma.sql`c.priority = ${filters.priority}`);
    const whereSql = where.length ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty;

    return this.prisma.$queryRaw<SupportConversationRow[]>`
      SELECT
        c.id,
        c.user_id AS "userId",
        u.name AS "userName",
        u.email AS "userEmail",
        c.site_id AS "siteId",
        s.name AS "siteName",
        c.subject,
        c.category,
        c.status,
        c.priority,
        c.channel,
        c.plan_snapshot AS "planSnapshot",
        c.assigned_admin_id AS "assignedAdminId",
        au.name AS "assignedAdminName",
        c.last_message_at AS "lastMessageAt",
        c.closed_at AS "closedAt",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        latest.body AS "latestMessage"
      FROM support_conversations c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN sites s ON s.id = c.site_id
      LEFT JOIN users au ON au.id = c.assigned_admin_id
      LEFT JOIN LATERAL (
        SELECT body FROM support_messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) latest ON true
      ${whereSql}
      ORDER BY
        CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        c.last_message_at DESC
      LIMIT 100
    `;
  }

  async getAdminMessages(conversationId: string) {
    await this.assertConversationExists(conversationId);
    return this.getMessages(conversationId);
  }

  async sendAdminMessage(adminId: string, conversationId: string, dto: SendSupportMessageDto) {
    await this.assertConversationExists(conversationId);
    const message = await this.insertMessage(conversationId, adminId, 'admin', dto.body.trim(), false);
    await this.updateConversationAfterMessage(conversationId, 'waiting_user');
    this.realtime.emitConversationUpdated(conversationId, { type: 'message_created' });
    const conversation = await this.getAdminConversation(conversationId);
    await this.integrations.notifyExternalReply(conversation, dto.body.trim());
    return message;
  }

  async sendExternalStaffReply(conversationId: string, body: string) {
    await this.assertConversationExists(conversationId);
    const message = await this.insertMessage(conversationId, null, 'admin', body.trim(), false);
    await this.updateConversationAfterMessage(conversationId, 'waiting_user');
    this.realtime.emitConversationUpdated(conversationId, { type: 'message_created' });
    return message;
  }

  async assignConversation(conversationId: string, dto: AssignSupportConversationDto, fallbackAdminId: string) {
    await this.assertConversationExists(conversationId);
    const adminId = dto.adminId || fallbackAdminId;
    await this.prisma.$executeRaw`
      UPDATE support_conversations
      SET assigned_admin_id = ${adminId}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${conversationId}
    `;
    const conversation = await this.getAdminConversation(conversationId);
    this.realtime.emitConversationUpdated(conversationId, { type: 'conversation_assigned' });
    return conversation;
  }

  async closeConversation(conversationId: string) {
    await this.assertConversationExists(conversationId);
    await this.prisma.$executeRaw`
      UPDATE support_conversations
      SET status = 'closed', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${conversationId}
    `;
    await this.summarizeConversation(conversationId);
    const conversation = await this.getAdminConversation(conversationId);
    this.realtime.emitConversationUpdated(conversationId, { type: 'conversation_closed' });
    return conversation;
  }

  async listKnowledgeItems(includeDisabled = false) {
    const rows = await this.prisma.$queryRaw<SupportKnowledgeRow[]>`
      SELECT
        id,
        title,
        category,
        question,
        answer,
        tags,
        enabled,
        priority,
        created_by_id AS "createdById",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM support_knowledge_items
      WHERE ${includeDisabled} OR enabled = true
      ORDER BY enabled DESC, priority DESC, updated_at DESC
      LIMIT 200
    `;
    return rows;
  }

  async seedDefaultKnowledge(adminId?: string | null) {
    let created = 0;
    let updated = 0;

    for (const item of DEFAULT_SUPPORT_KNOWLEDGE) {
      const existing = await this.findKnowledgeByTitleAndCategory(item.title, item.category);
      if (existing) {
        await this.updateDefaultKnowledgeItem(existing.id, item);
        updated += 1;
        continue;
      }

      await this.createDefaultKnowledgeItem(item, adminId ?? null);
      created += 1;
    }

    return {
      created,
      updated,
      total: DEFAULT_SUPPORT_KNOWLEDGE.length,
    };
  }

  async createKnowledgeItem(adminId: string, dto: UpsertSupportKnowledgeDto) {
    const id = randomUUID();
    const tags = this.normalizeTags(dto.tags);
    await this.prisma.$executeRaw`
      INSERT INTO support_knowledge_items
        (id, title, category, question, answer, tags, enabled, priority, created_by_id, created_at, updated_at)
      VALUES
        (
          ${id},
          ${dto.title.trim()},
          ${dto.category?.trim() || 'general'},
          ${dto.question?.trim() || null},
          ${dto.answer.trim()},
          ${tags},
          ${dto.enabled ?? true},
          ${dto.priority ?? 0},
          ${adminId},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
    `;
    return this.getKnowledgeItem(id);
  }

  async updateKnowledgeItem(id: string, dto: UpsertSupportKnowledgeDto) {
    await this.assertKnowledgeExists(id);
    const tags = this.normalizeTags(dto.tags);
    await this.prisma.$executeRaw`
      UPDATE support_knowledge_items
      SET
        title = ${dto.title.trim()},
        category = ${dto.category?.trim() || 'general'},
        question = ${dto.question?.trim() || null},
        answer = ${dto.answer.trim()},
        tags = ${tags},
        enabled = ${dto.enabled ?? true},
        priority = ${dto.priority ?? 0},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `;
    return this.getKnowledgeItem(id);
  }

  async toggleKnowledgeItem(id: string, enabled: boolean) {
    await this.assertKnowledgeExists(id);
    await this.prisma.$executeRaw`
      UPDATE support_knowledge_items
      SET enabled = ${enabled}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `;
    return this.getKnowledgeItem(id);
  }

  async summarizeConversation(conversationId: string) {
    const conversation = await this.getAdminConversation(conversationId);
    const messages = await this.getMessages(conversationId);
    const transcript = messages
      .map((message) => `${message.senderRole}: ${message.body}`)
      .join('\n')
      .slice(-12000);

    let summary = '';
    let resolution = '';
    let tags: string[] = [];

    if (this.openai && this.config.get<string>('SUPPORT_AI_ENABLED') !== '0') {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.config.get<string>('SUPPORT_AI_MODEL') || 'gpt-4o-mini',
          max_tokens: 500,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: `請把以下 Geovault 客服對話整理成客服記憶，回傳 JSON：
{
  "summary": "用 2 到 4 句話說明使用者遇到的問題、背景與目前狀態",
  "resolution": "若已解決，寫明解法；若未解決，寫下一步需要人工處理的事項",
  "tags": ["3 到 8 個小寫標籤，例如 billing、llms、scan"]
}

要求：
- 只根據對話內容摘要，不要補不存在的事實。
- 用繁體中文。
- tags 請使用英文小寫短標籤。

對話：
${transcript}`,
            },
          ],
        });
        const parsed = JSON.parse(response.choices[0]?.message?.content || '{}') as {
          summary?: string;
          resolution?: string;
          tags?: string[];
        };
        summary = String(parsed.summary || '').trim();
        resolution = String(parsed.resolution || '').trim();
        tags = this.normalizeTags(parsed.tags);
      } catch {
        // Fall through to deterministic summary below.
      }
    }

    if (!summary) {
      summary = messages
        .slice(-6)
        .map((message) => `${message.senderRole}: ${message.body}`)
        .join('\n')
        .slice(0, 2000);
      resolution = conversation.status === 'closed'
        ? '對話已關閉，請依最後一則客服或系統訊息判斷是否已解決。'
        : '對話尚未關閉，後續仍需依使用者回覆或人工客服處理。';
      tags = this.normalizeTags([conversation.category, conversation.priority, conversation.planSnapshot]);
    }

    await this.prisma.$executeRaw`
      INSERT INTO support_conversation_summaries
        (id, conversation_id, user_id, site_id, category, summary, resolution, tags, created_at, updated_at)
      VALUES
        (
          ${randomUUID()},
          ${conversation.id},
          ${conversation.userId},
          ${conversation.siteId},
          ${conversation.category},
          ${summary},
          ${resolution || null},
          ${tags},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      ON CONFLICT (conversation_id)
      DO UPDATE SET
        summary = EXCLUDED.summary,
        resolution = EXCLUDED.resolution,
        tags = EXCLUDED.tags,
        updated_at = CURRENT_TIMESTAMP
    `;

    return this.getConversationSummary(conversationId);
  }

  async getConversationSummary(conversationId: string) {
    const rows = await this.prisma.$queryRaw<SupportConversationSummaryRow[]>`
      SELECT
        id,
        conversation_id AS "conversationId",
        user_id AS "userId",
        site_id AS "siteId",
        category,
        summary,
        resolution,
        tags,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM support_conversation_summaries
      WHERE conversation_id = ${conversationId}
      LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('Support conversation summary not found');
    return rows[0];
  }

  private async getAdminConversation(conversationId: string) {
    const rows = await this.prisma.$queryRaw<SupportConversationRow[]>`
      SELECT
        c.id,
        c.user_id AS "userId",
        u.name AS "userName",
        u.email AS "userEmail",
        c.site_id AS "siteId",
        s.name AS "siteName",
        c.subject,
        c.category,
        c.status,
        c.priority,
        c.channel,
        c.plan_snapshot AS "planSnapshot",
        c.assigned_admin_id AS "assignedAdminId",
        au.name AS "assignedAdminName",
        c.last_message_at AS "lastMessageAt",
        c.closed_at AS "closedAt",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        latest.body AS "latestMessage"
      FROM support_conversations c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN sites s ON s.id = c.site_id
      LEFT JOIN users au ON au.id = c.assigned_admin_id
      LEFT JOIN LATERAL (
        SELECT body FROM support_messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) latest ON true
      WHERE c.id = ${conversationId}
      LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('Support conversation not found');
    return rows[0];
  }

  private async getMessages(conversationId: string) {
    return this.prisma.$queryRaw<SupportMessageRow[]>`
      SELECT
        m.id,
        m.conversation_id AS "conversationId",
        m.sender_id AS "senderId",
        u.name AS "senderName",
        m.sender_role AS "senderRole",
        m.body,
        m.is_ai AS "isAi",
        m.created_at AS "createdAt"
      FROM support_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ${conversationId}
      ORDER BY m.created_at ASC
      LIMIT 500
    `;
  }

  private async insertMessage(
    conversationId: string,
    senderId: string | null,
    senderRole: string,
    body: string,
    isAi: boolean,
  ) {
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO support_messages
        (id, conversation_id, sender_id, sender_role, body, is_ai, created_at)
      VALUES
        (${id}, ${conversationId}, ${senderId}, ${senderRole}, ${body}, ${isAi}, CURRENT_TIMESTAMP)
    `;
    const rows = await this.prisma.$queryRaw<SupportMessageRow[]>`
      SELECT
        m.id,
        m.conversation_id AS "conversationId",
        m.sender_id AS "senderId",
        u.name AS "senderName",
        m.sender_role AS "senderRole",
        m.body,
        m.is_ai AS "isAi",
        m.created_at AS "createdAt"
      FROM support_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.id = ${id}
      LIMIT 1
    `;
    return rows[0];
  }

  private async updateConversationAfterMessage(conversationId: string, status: string) {
    await this.prisma.$executeRaw`
      UPDATE support_conversations
      SET status = ${status}, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${conversationId}
    `;
  }

  private async assertConversationExists(conversationId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM support_conversations WHERE id = ${conversationId} LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('Support conversation not found');
  }

  private async getKnowledgeItem(id: string) {
    const rows = await this.prisma.$queryRaw<SupportKnowledgeRow[]>`
      SELECT
        id,
        title,
        category,
        question,
        answer,
        tags,
        enabled,
        priority,
        created_by_id AS "createdById",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM support_knowledge_items
      WHERE id = ${id}
      LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('Support knowledge item not found');
    return rows[0];
  }

  private async findKnowledgeByTitleAndCategory(title: string, category: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM support_knowledge_items
      WHERE title = ${title}
        AND category = ${category}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async createDefaultKnowledgeItem(item: DefaultSupportKnowledgeItem, adminId: string | null) {
    await this.prisma.$executeRaw`
      INSERT INTO support_knowledge_items
        (id, title, category, question, answer, tags, enabled, priority, created_by_id, created_at, updated_at)
      VALUES
        (
          ${randomUUID()},
          ${item.title},
          ${item.category},
          ${item.question},
          ${item.answer},
          ${this.normalizeTags(item.tags)},
          true,
          ${item.priority},
          ${adminId},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
    `;
  }

  private async updateDefaultKnowledgeItem(id: string, item: DefaultSupportKnowledgeItem) {
    await this.prisma.$executeRaw`
      UPDATE support_knowledge_items
      SET
        question = ${item.question},
        answer = ${item.answer},
        tags = ${this.normalizeTags(item.tags)},
        enabled = true,
        priority = GREATEST(priority, ${item.priority}),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `;
  }

  private async assertKnowledgeExists(id: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM support_knowledge_items WHERE id = ${id} LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('Support knowledge item not found');
  }

  private normalizeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    return [...new Set(
      tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    )].slice(0, 20);
  }

  private async assertSiteAccess(userId: string, role: string | undefined, siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { userId: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    if (role === 'ADMIN' || role === 'SUPER_ADMIN' || site.userId === userId) return;
    throw new ForbiddenException('You do not have access to this site');
  }

  private planConfig(plan: UserPlan): { priority: string; channel: string } {
    if (plan === 'PRO') return { priority: 'high', channel: 'realtime' };
    if (plan === 'STARTER') return { priority: 'normal', channel: 'message' };
    return { priority: 'low', channel: 'ticket' };
  }

  private async generateAiSupportReply(args: {
    userId: string;
    conversationId: string;
    plan: UserPlan;
    category: string;
    subject: string;
    body: string;
    siteId?: string | null;
  }): Promise<{ body: string; requiresHuman: boolean }> {
    if (this.config.get<string>('SUPPORT_AI_ENABLED') === '0' || !this.openai) {
      return {
        body: this.buildFallbackReply(args.plan, args.category),
        requiresHuman: true,
      };
    }

    if (this.isLowInformationMessage(args.body)) {
      return {
        body: this.buildClarificationReply(args.body, args.plan),
        requiresHuman: true,
      };
    }

    try {
      const context = await this.buildSupportContext(
        args.userId,
        args.conversationId,
        args.category,
        args.body,
        args.siteId,
      );
      const prompt = `你是 Geovault 的 AI 客服助理。請像真人客服一樣，用繁體中文、自然、具體、簡短地回覆使用者。

你只能根據「客服知識庫、使用者資料、網站資料、過往客服摘要、目前對話」回答。不要編造功能、價格、部署狀態或人工已完成的動作。

請只回傳 JSON：
{
  "answer": "給使用者看的回覆文字",
  "confidence": 0-100,
  "requiresHuman": true/false
}

判斷規則：
- 如果知識庫或使用者上下文足以回答，直接給 1 到 3 個可操作步驟。
- 如果缺少網址、網站、錯誤訊息、帳務資訊或截圖，先請使用者補充最少必要資訊。
- 付款、扣點、帳號權限、資料刪除、正式環境異常、部署失敗、PRO 用戶、或你不確定時，requiresHuman 必須是 true。
- 不要使用制式開場，不要說「親愛的用戶」，不要長篇教學。
- 可以口語化，但不要過度熱情。
- 若使用者只輸入短字串或測試訊息，請自然追問具體問題。

使用者方案：${args.plan}
問題分類：${args.category}
對話標題：${args.subject}
使用者最新訊息：
${args.body}

可用上下文：
${context}`;

      const response = await this.openai.chat.completions.create({
        model: this.config.get<string>('SUPPORT_AI_MODEL') || 'gpt-4o-mini',
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      });
      const raw = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(raw) as { answer?: string; confidence?: number; requiresHuman?: boolean };
      const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : '';
      const confidence = Number(parsed.confidence ?? 0);
      const requiresHuman = parsed.requiresHuman !== false || confidence < 70 || args.plan === 'PRO';

      if (!answer) {
        return { body: this.buildFallbackReply(args.plan, args.category), requiresHuman: true };
      }

      return {
        body: this.addNaturalSupportFollowUp(answer, requiresHuman, args.plan),
        requiresHuman,
      };
    } catch {
      return {
        body: this.buildFallbackReply(args.plan, args.category),
        requiresHuman: true,
      };
    }
  }

  private async buildSupportContext(
    userId: string,
    conversationId: string,
    category: string,
    latestMessage: string,
    siteId?: string | null,
  ): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, plan: true, credits: true, freeGenUsed: true },
    });
    const supportKnowledge = await this.findRelevantKnowledgeItems(category || 'general', latestMessage);
    const previousSupportSummaries = await this.findRecentSupportSummaries(userId, siteId);
    const currentMessages = await this.getRecentConversationMessages(conversationId);

    const selectedSite = siteId
      ? await this.prisma.site.findFirst({
          where: { id: siteId, userId },
          select: {
            id: true,
            name: true,
            url: true,
            industry: true,
            isPublic: true,
            bestScore: true,
            tier: true,
            llmsTxtUpdatedAt: true,
            scans: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                totalScore: true,
                status: true,
                completedAt: true,
                results: {
                  select: {
                    indicator: true,
                    score: true,
                    status: true,
                    suggestion: true,
                  },
                },
              },
            },
            qas: {
              take: 5,
              orderBy: { sortOrder: 'asc' },
              select: { question: true, answer: true },
            },
            crawlerVisits: {
              take: 5,
              orderBy: { visitedAt: 'desc' },
              select: { botName: true, url: true, visitedAt: true, isSeeded: true },
            },
            blogArticles: {
              where: { published: true },
              take: 5,
              orderBy: { createdAt: 'desc' },
              select: { title: true, slug: true, templateType: true, createdAt: true },
            },
          },
        })
      : null;

    const userSites = siteId
      ? []
      : await this.prisma.site.findMany({
          where: { userId },
          take: 5,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            name: true,
            url: true,
            industry: true,
            isPublic: true,
            bestScore: true,
            tier: true,
          },
        });

    const siteSummary = selectedSite
      ? {
          id: selectedSite.id,
          name: selectedSite.name,
          url: selectedSite.url,
          industry: selectedSite.industry,
          isPublic: selectedSite.isPublic,
          bestScore: selectedSite.bestScore,
          tier: selectedSite.tier,
          llmsTxtUpdatedAt: selectedSite.llmsTxtUpdatedAt,
          latestScan: selectedSite.scans[0] || null,
          qas: selectedSite.qas,
          crawlerVisits: selectedSite.crawlerVisits,
          blogArticles: selectedSite.blogArticles,
        }
      : null;

    return JSON.stringify(
      {
        user,
        selectedSite: siteSummary,
        userSites,
        supportKnowledge,
        previousSupportSummaries,
        currentMessages,
        platformRules: {
          free: 'FREE 方案以工單處理為主，適合基礎掃描與初步排查。',
          starter: 'STARTER 方案提供站內訊息支援，可協助處理一般設定與使用問題。',
          pro: 'PRO 方案應優先交由人工客服即時處理；AI 只能先整理狀況與排查方向。',
          crawlerSimulation: '正式環境的 ENABLE_CRAWLER_SIMULATION 必須設為 0，避免模擬資料干擾正式 crawler 數據。',
          contentGuardrail: '內容引擎若品牌資料或知識庫不足，必須在扣點與呼叫 AI 前禁止生成。',
        },
      },
      null,
      2,
    );
  }

  private async findRelevantKnowledgeItems(category: string, query: string): Promise<SupportKnowledgeRow[]> {
    const rows = await this.prisma.$queryRaw<SupportKnowledgeRow[]>`
      SELECT
        id,
        title,
        category,
        question,
        answer,
        tags,
        enabled,
        priority,
        created_by_id AS "createdById",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM support_knowledge_items
      WHERE enabled = true
      ORDER BY priority DESC, updated_at DESC
      LIMIT 120
    `;

    const tokens = this.extractSearchTokens(`${category} ${query}`);
    const scored = rows.map((item) => ({
      item,
      score: this.scoreKnowledgeItem(item, category, tokens),
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((entry) => entry.item);
  }

  private isLowInformationMessage(body: string): boolean {
    const text = body.trim();
    if (!text) return true;
    const compact = text.replace(/\s+/g, '');
    const meaningfulChars = compact.replace(/[0-9\p{P}\p{S}_]/gu, '');
    if (compact.length <= 3) return true;
    if (meaningfulChars.length < 2 && compact.length <= 8) return true;
    return false;
  }

  private buildClarificationReply(body: string, plan: UserPlan): string {
    const message = body.trim();
    const handoff =
      plan === 'PRO'
        ? '你是 PRO 方案，我也會把這個對話留在客服隊列，方便工作人員接手。'
        : '我會先幫你釐清狀況，必要時再交給客服人員接手。';

    return `我目前只看到「${message}」，資訊還不夠判斷。你可以直接補一句：你在哪個頁面遇到問題、你原本想做什麼、畫面出現什麼錯誤。${handoff}`;
  }

  private addNaturalSupportFollowUp(answer: string, requiresHuman: boolean, plan: UserPlan): string {
    const trimmed = answer.trim();
    const alreadyMentionsHuman =
      trimmed.includes('人工') ||
      trimmed.includes('客服人員') ||
      trimmed.includes('工作人員') ||
      trimmed.includes('接手');

    if (requiresHuman) {
      if (alreadyMentionsHuman) return trimmed;
      const suffix =
        plan === 'PRO'
          ? '我會把這個狀況保留給工作人員優先接手；你也可以補上截圖或錯誤訊息，處理會更快。'
          : '如果你照上面做完還是不行，我會把這個對話交給客服人員接手。';
      return `${trimmed}\n\n${suffix}`;
    }

    const alreadyAsksFollowUp =
      trimmed.includes('可以再') ||
      trimmed.includes('補充') ||
      trimmed.includes('截圖') ||
      trimmed.includes('網址');
    if (alreadyAsksFollowUp) return trimmed;
    return trimmed;
  }

  private async findRecentSupportSummaries(userId: string, siteId?: string | null): Promise<SupportConversationSummaryRow[]> {
    if (siteId) {
      return this.prisma.$queryRaw<SupportConversationSummaryRow[]>`
        SELECT
          id,
          conversation_id AS "conversationId",
          user_id AS "userId",
          site_id AS "siteId",
          category,
          summary,
          resolution,
          tags,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM support_conversation_summaries
        WHERE user_id = ${userId}
          AND (site_id = ${siteId} OR site_id IS NULL)
        ORDER BY updated_at DESC
        LIMIT 5
      `;
    }

    return this.prisma.$queryRaw<SupportConversationSummaryRow[]>`
      SELECT
        id,
        conversation_id AS "conversationId",
        user_id AS "userId",
        site_id AS "siteId",
        category,
        summary,
        resolution,
        tags,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM support_conversation_summaries
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC
      LIMIT 5
    `;
  }

  private async getRecentConversationMessages(conversationId: string): Promise<Array<{ senderRole: string; body: string; createdAt: Date }>> {
    const rows = await this.prisma.$queryRaw<Array<{ senderRole: string; body: string; createdAt: Date }>>`
      SELECT
        sender_role AS "senderRole",
        body,
        created_at AS "createdAt"
      FROM support_messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at DESC
      LIMIT 10
    `;
    return rows.reverse();
  }

  private extractSearchTokens(text: string): string[] {
    return [...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fff.]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    )].slice(0, 20);
  }

  private scoreKnowledgeItem(item: SupportKnowledgeRow, category: string, tokens: string[]): number {
    const haystack = [
      item.title,
      item.category,
      item.question || '',
      item.answer,
      ...item.tags,
    ].join(' ').toLowerCase();

    let score = item.priority;
    if (item.category === category) score += 500;
    if (item.category === 'general') score += 120;
    for (const token of tokens) {
      if (haystack.includes(token)) score += 80;
    }
    return score;
  }

  private buildFallbackReply(plan: UserPlan, category?: string): string {
    const topic = category ? `「${category}」這類問題` : '這個問題';
    if (plan === 'PRO') {
      return `我先幫你把${topic}留在客服隊列。這題需要人工確認比較穩，請補上相關網址、錯誤畫面或你剛剛操作的步驟，工作人員可以更快接手。`;
    }
    if (plan === 'STARTER') {
      return `我目前無法百分之百判斷${topic}。你可以補上網站網址、錯誤訊息或截圖，我會先協助排查；如果不是一般設定問題，會再交由客服人員處理。`;
    }
    return `我目前需要更多資訊才能判斷${topic}。請補上你在哪個頁面、想完成什麼操作、看到什麼錯誤；資料足夠後我會先給你可操作的處理方向。`;
  }


}
