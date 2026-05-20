import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { PrismaService } from '../../prisma/prisma.service';

interface SocketLike {
  handshake?: {
    auth?: Record<string, unknown>;
    headers?: Record<string, string | string[] | undefined>;
  };
  join?: (room: string) => void;
  emit?: (event: string, payload: unknown) => void;
  disconnect?: (close?: boolean) => void;
}

interface ServerLike {
  emit: (event: string, payload: unknown) => void;
  to?: (room: string) => { emit: (event: string, payload: unknown) => void };
}

interface SupportUpdatePayload {
  type?: string;
}

interface SupportSocketUser {
  userId: string;
  role: string;
}

@WebSocketGateway({
  namespace: '/support',
  cors: { origin: '*' },
})
export class SupportRealtimeGateway {
  private readonly logger = new Logger(SupportRealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @WebSocketServer()
  private server?: ServerLike;

  @SubscribeMessage('support:join')
  async joinConversation(
    @ConnectedSocket() client: SocketLike,
    @MessageBody() data: { conversationId?: string },
  ) {
    if (!data?.conversationId) return { ok: false };
    const user = this.getSocketUser(client);
    if (!user) return this.reject(client, 'unauthorized');
    const allowed = await this.canJoinConversation(user, data.conversationId);
    if (!allowed) return this.reject(client, 'forbidden');

    client.join?.(`support:conversation:${data.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('support:admin:join')
  joinAdmin(@ConnectedSocket() client: SocketLike) {
    const user = this.getSocketUser(client);
    if (!user) return this.reject(client, 'unauthorized');
    if (!this.isStaffRole(user.role)) return this.reject(client, 'forbidden');

    client.join?.('support:admin');
    return { ok: true };
  }

  emitConversationUpdated(conversationId: string, payload: SupportUpdatePayload = {}): void {
    try {
      const safePayload = {
        conversationId,
        type: payload.type ?? 'conversation_updated',
      };

      this.server?.to?.(`support:conversation:${conversationId}`)?.emit('support:updated', safePayload);
      this.server?.to?.('support:admin')?.emit('support:admin:updated', safePayload);
    } catch (err) {
      this.logger.warn(`Support realtime emit failed: ${err}`);
    }
  }

  private getSocketUser(client: SocketLike): SupportSocketUser | null {
    const authToken = client.handshake?.auth?.token;
    const header = client.handshake?.headers?.authorization;
    const authorization = Array.isArray(header) ? header[0] : header;
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    const token = typeof authToken === 'string' ? authToken : bearer;

    if (!token) return null;

    try {
      const payload = this.jwt.verify<{ sub?: string; role?: string }>(token);
      if (!payload.sub || !payload.role) return null;
      return { userId: payload.sub, role: payload.role };
    } catch {
      return null;
    }
  }

  private async canJoinConversation(user: SupportSocketUser, conversationId: string): Promise<boolean> {
    if (this.isStaffRole(user.role)) return true;

    const rows = await this.prisma.$queryRaw<Array<{ userId: string }>>(
      Prisma.sql`
        SELECT user_id AS "userId"
        FROM support_conversations
        WHERE id = ${conversationId}
        LIMIT 1
      `,
    );

    return rows[0]?.userId === user.userId;
  }

  private isStaffRole(role: string): boolean {
    return role === 'STAFF' || role === 'ADMIN' || role === 'SUPER_ADMIN';
  }

  private reject(client: SocketLike, error: 'unauthorized' | 'forbidden') {
    client.emit?.('support:error', { error });
    return { ok: false, error };
  }
}
