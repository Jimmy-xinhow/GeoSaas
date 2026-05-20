import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
export class SupportService {
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
              content: `請把以下 Geovault 客服對話整理成可供下次客服 AI 讀取的記憶摘要。只輸出 JSON：
{
  "summary": "問題與背景摘要",
  "resolution": "已採取的處理或目前結論",
  "tags": ["短標籤"]
}

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
      resolution = conversation.status === 'closed' ? '客服單已關閉，未能自動判斷完整結論。' : '客服單尚未關閉。';
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
      const context = await this.buildSupportContext(args.userId, args.category, args.siteId);
      const prompt = `你是 Geovault 的真人感 AI 客服助理。你要像一位熟悉產品的同事在對話，不要像 FAQ 機器人。

回覆格式只能是 JSON：
{
  "answer": "繁體中文客服回覆",
  "confidence": 0-100,
  "requiresHuman": true/false
}

判斷規則：
- 如果是帳務退款、資安、資料刪除、正式環境疑似故障、部署權限、法律問題，requiresHuman 必須是 true。
- 如果系統資料足以回答掃描、llms.txt、Badge、文章品質、AI 爬蟲、成功案例、方案差異，可以先給明確步驟。
- 不要假裝已經做了你沒有做的操作。
- 回覆要短、自然、可執行、白話。先接住使用者的問題，再回答或追問。
- 不要使用客服罐頭語、制式條列、過度正式的結尾；除非真的在給步驟，否則用一小段自然對話即可。
- 不要每次都說「如果你補充更多...」這類固定句。真的缺資料時才追問，而且一次只問最關鍵的 1 到 2 個問題。
- 如果沒有特定網站或掃描報告，不要一次列很多可能原因；先用一句話說最可能方向，再請使用者貼網址或截圖。
- 不要使用驚嘆號，不要說「我可以引導你」這類 AI 感很重的句子。
- 如果需要客服接手，要自然說明已經會讓同事接手，不要像系統通知。
- 如果使用者訊息只有數字、代碼、單字、問候、或無法判斷真正問題，不要套用分類知識回答；請像真人一樣說你目前看不出他要處理什麼，請他補一句發生的狀況或貼畫面，confidence 必須低於 50，requiresHuman 必須是 true。
- 主旨只能輔助判斷，不能取代使用者訊息；如果主旨和訊息都不清楚，必須要求補充。

使用者方案：${args.plan}
分類：${args.category}
主旨：${args.subject}
使用者訊息：
${args.body}

系統資料：
${context}
`;

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

  private async buildSupportContext(userId: string, category: string, siteId?: string | null): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, plan: true, credits: true },
    });
    const supportKnowledge = await this.findRelevantKnowledgeItems(category || 'general');
    const previousSupportSummaries = await this.findRecentSupportSummaries(userId, siteId);

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
        supportKnowledge,
        previousSupportSummaries,
        platformRules: {
          free: 'FREE 使用工單制，非即時。',
          starter: 'STARTER 使用站內訊息。',
          pro: 'PRO 即時優先且人工需接手確認。',
          crawlerSimulation: '正式環境 ENABLE_CRAWLER_SIMULATION 必須是 0。',
        },
      },
      null,
      2,
    );
  }

  private async findRelevantKnowledgeItems(category: string): Promise<SupportKnowledgeRow[]> {
    if (category === 'general') {
      return this.prisma.$queryRaw<SupportKnowledgeRow[]>`
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
          AND category = 'general'
        ORDER BY priority DESC, updated_at DESC
        LIMIT 8
      `;
    }

    return this.prisma.$queryRaw<SupportKnowledgeRow[]>`
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
        AND (category = ${category} OR category = 'general')
      ORDER BY
        CASE WHEN category = ${category} THEN 0 ELSE 1 END,
        priority DESC,
        updated_at DESC
      LIMIT 12
    `;
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
        ? '你是 PRO 方案，我會先把這段留給客服同事優先看。'
        : '我先把這則對話留在工單裡。';

    return `我有看到你傳「${message}」，但這樣我還判斷不出你遇到的是哪一段問題。你直接補一句發生什麼狀況，或貼上網址、錯誤畫面，我就能接著幫你看。${handoff}`;
  }

  private addNaturalSupportFollowUp(answer: string, requiresHuman: boolean, plan: UserPlan): string {
    const trimmed = answer.trim();
    const alreadyMentionsHuman =
      trimmed.includes('客服') ||
      trimmed.includes('同事') ||
      trimmed.includes('人工') ||
      trimmed.includes('接手');

    if (requiresHuman) {
      if (alreadyMentionsHuman) return trimmed;
      const suffix =
        plan === 'PRO'
          ? '我也會把這段先交給客服同事優先看，後面直接在這裡接著回你。'
          : '我會把這段先留給客服同事看，後面直接在這裡接著回你。';
      return `${trimmed}\n\n${suffix}`;
    }

    const alreadyAsksFollowUp =
      trimmed.includes('貼') ||
      trimmed.includes('補') ||
      trimmed.includes('網址') ||
      trimmed.includes('畫面');
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

  private buildFallbackReply(plan: UserPlan, category?: string): string {
    const topic = category ? `「${category}」` : '這個問題';
    if (plan === 'PRO') {
      return `已收到你關於${topic}的訊息。你目前是 PRO 方案，這則對話已標記為高優先級；客服會優先接手。你可以繼續補充網站、截圖或錯誤訊息。`;
    }
    if (plan === 'STARTER') {
      return `已收到你關於${topic}的訊息。這則對話會以站內訊息方式處理；如果問題和掃描、llms.txt、Badge 或文章有關，請補上網站名稱與畫面截圖。`;
    }
    return `已收到你關於${topic}的工單。FREE 方案會以非即時工單方式回覆；若是正式環境異常，請補上網站網址與發生時間，方便我們判斷。`;
  }
}
