import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { AffiliateService } from '../affiliate/affiliate.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

// Public Client ID — paired with the same value baked into the web Dockerfile.
// OAuth client IDs are not secrets; origin allow-listing is enforced by Google.
// Env override wins when set.
const GOOGLE_CLIENT_ID_FALLBACK =
  '154774079870-9m0cu8ubcd9p7n4nesa1rdcbg6cm3bbs.apps.googleusercontent.com';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;
  private googleClientId: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private notifications: NotificationsService,
    private email: EmailService,
    private affiliateService: AffiliateService,
  ) {
    this.googleClientId =
      this.config.get<string>('GOOGLE_CLIENT_ID') || GOOGLE_CLIENT_ID_FALLBACK;
    this.googleClient = new OAuth2Client(this.googleClientId);
  }

  async register(dto: RegisterDto, origin?: string) {
    const email = this.normalizeEmail(dto.email);
    const name = this.normalizeOptionalName(dto.name);
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException('Email already registered. Please log in or verify this email.');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true, role: true, plan: true, emailVerified: true, createdAt: true },
    });

    const verificationToken = await this.createEmailVerificationToken(user.id);
    const verificationUrl = this.buildEmailVerificationUrl(verificationToken, origin);
    await this.email.sendEmailVerification(user.email, user.name ?? undefined, verificationUrl);

    // Send welcome notification + email (non-blocking)
    this.notifications.create(user.id, 'welcome', '歡迎加入 Geovault', `${user.name || '使用者'}，感謝您註冊 Geovault！`).catch(() => {});

    this.affiliateService.attributeSignup(user.id, dto.affiliateCode, dto.affiliateVisitorId).catch(() => {});

    return {
      user,
      requiresEmailVerification: true,
      message: 'Please verify your email before logging in.',
      ...(this.shouldExposeDevVerificationUrl(origin)
        ? { devVerificationUrl: verificationUrl }
        : {}),
    };
  }

  async login(dto: LoginDto) {
    const offlineUser = this.getOfflineAdminUser(dto.email, dto.password);
    if (offlineUser) {
      const tokens = await this.generateTokens(offlineUser.id, offlineUser.email, offlineUser.role);
      return { user: offlineUser, ...tokens };
    }

    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    if (!user.emailVerified) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before logging in.',
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
      },
      ...tokens,
    };
  }

  async loginWithGoogle(idToken: string, affiliateCode?: string, affiliateVisitorId?: string) {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }

    if (!payload || !payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google token payload');
    }
    if (payload.email_verified === false) {
      throw new UnauthorizedException('Google email not verified');
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const name = payload.name ?? payload.given_name ?? null;
    const avatarUrl = payload.picture ?? null;

    // 1) 依 googleId 找；2) 否則依 email 找並綁定 googleId；3) 都沒有就建立新使用者
    let user = await this.prisma.user.findUnique({ where: { googleId } });
    let isNewUser = false;

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({ where: { email } });
      if (existingByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleId,
            emailVerified: true,
            avatarUrl: existingByEmail.avatarUrl ?? avatarUrl,
            name: existingByEmail.name ?? name,
          },
        });
      } else {
        user = await this.prisma.user.create({
          data: { email, name, avatarUrl, googleId, emailVerified: true },
        });
        isNewUser = true;
      }
    }

    if (isNewUser) {
      this.notifications
        .create(user.id, 'welcome', '歡迎加入 Geovault', `${user.name || '使用者'}，感謝您以 Google 帳號註冊 Geovault！`)
        .catch(() => {});
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    if (isNewUser) {
      this.affiliateService.attributeSignup(user.id, affiliateCode, affiliateVisitorId).catch(() => {});
    }
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException();
      return this.generateTokens(user.id, user.email, user.role);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async forgotPassword(emailInput: string, origin?: string) {
    const email = this.normalizeEmail(emailInput);
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true },
    });

    const generic = {
      message: '如果此 email 已註冊，我們會寄出密碼重設連結。',
    };
    if (!user) return generic;

    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashPasswordResetToken(token);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const webUrl = this.resolveFrontendUrl(origin);
    const resetUrl = `${webUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    await this.email.sendPasswordReset(user.email, resetUrl);

    return {
      ...generic,
      ...(this.shouldExposeDevVerificationUrl(origin)
        ? { devResetUrl: resetUrl }
        : {}),
    };
  }

  async verifyEmail(token: string) {
    const tokenHash = this.hashEmailVerificationToken(token);
    const verificationToken = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!verificationToken || verificationToken.usedAt || verificationToken.expiresAt <= new Date()) {
      throw new BadRequestException('Email verification link is invalid or expired.');
    }

    const verifiedAt = new Date();
    const [, user] = await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: verifiedAt },
      }),
      this.prisma.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerified: true },
      }),
      this.prisma.emailVerificationToken.deleteMany({
        where: {
          userId: verificationToken.userId,
          usedAt: null,
          id: { not: verificationToken.id },
        },
      }),
    ]);

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
      },
      ...tokens,
      message: 'Email verified successfully.',
    };
  }

  async resendVerification(emailInput: string, origin?: string) {
    const generic = {
      message: 'If this email needs verification, we sent a new verification link.',
    };
    const email = this.normalizeEmail(emailInput);
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, name: true, emailVerified: true },
    });

    if (!user || user.emailVerified) return generic;

    const token = await this.createEmailVerificationToken(user.id);
    const verificationUrl = this.buildEmailVerificationUrl(token, origin);
    await this.email.sendEmailVerification(user.email, user.name ?? undefined, verificationUrl);

    return {
      ...generic,
      ...(this.shouldExposeDevVerificationUrl(origin)
        ? { devVerificationUrl: verificationUrl }
        : {}),
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.hashPasswordResetToken(token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      throw new BadRequestException('重設連結無效或已過期');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
          id: { not: resetToken.id },
        },
      }),
    ]);

    return { message: '密碼已更新，請使用新密碼登入。' };
  }

  async getProfile(userId: string) {
    if (process.env.LOCAL_OFFLINE_MODE === '1' && userId === 'local-offline-admin') {
      return {
        id: 'local-offline-admin',
        email: process.env.LOCAL_OFFLINE_ADMIN_EMAIL || 'local-admin@geovault.test',
        name: 'Local Admin',
        role: 'SUPER_ADMIN',
        plan: 'PRO',
        avatarUrl: null,
        createdAt: new Date(),
      };
    }

    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, plan: true, avatarUrl: true, createdAt: true },
    });
  }

  async updateProfile(userId: string, data: { name?: string; email?: string }) {
    const updateData: { name?: string; email?: string } = {};
    if (data.email) {
      updateData.email = this.normalizeEmail(data.email);
      const existing = await this.prisma.user.findFirst({
        where: {
          email: { equals: updateData.email, mode: 'insensitive' },
          id: { not: userId },
        },
      });
      if (existing) throw new ConflictException('Email already in use');
    }
    if (data.name !== undefined) {
      const name = this.normalizeOptionalName(data.name);
      if (!name) throw new BadRequestException('Name is required');
      updateData.name = name;
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, plan: true, avatarUrl: true, createdAt: true },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { message: 'Password updated successfully' };
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };
    const [token, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);
    return { token, refreshToken };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeOptionalName(name?: string | null): string | undefined {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    return trimmed || undefined;
  }

  private getOfflineAdminUser(emailInput: string, password: string) {
    if (process.env.LOCAL_OFFLINE_MODE !== '1') return null;
    const email = this.normalizeEmail(emailInput);
    const expectedEmail = this.normalizeEmail(
      process.env.LOCAL_OFFLINE_ADMIN_EMAIL || 'local-admin@geovault.test',
    );
    const expectedPassword = process.env.LOCAL_OFFLINE_ADMIN_PASSWORD || 'LocalAdmin123!';
    if (email !== expectedEmail || password !== expectedPassword) return null;
    return {
      id: 'local-offline-admin',
      email: expectedEmail,
      name: 'Local Admin',
      role: 'SUPER_ADMIN',
      plan: 'PRO',
      avatarUrl: null,
    };
  }

  private hashPasswordResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async createEmailVerificationToken(userId: string): Promise<string> {
    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId, usedAt: null },
    });

    const token = randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: this.hashEmailVerificationToken(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return token;
  }

  private buildEmailVerificationUrl(token: string, origin?: string): string {
    const webUrl = this.resolveFrontendUrl(origin);
    return `${webUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  }

  private resolveFrontendUrl(origin?: string): string {
    if (origin && this.isTrustedLocalOrigin(origin)) return origin;
    return this.config.get<string>('FRONTEND_URL')
      || this.config.get<string>('WEB_URL')
      || 'https://www.geovault.app';
  }

  private isTrustedLocalOrigin(origin?: string): boolean {
    if (!origin) return false;
    try {
      const url = new URL(origin);
      const host = url.hostname;
      return (
        url.protocol === 'http:' &&
        (host === 'localhost' ||
          host === '127.0.0.1' ||
          host.startsWith('192.168.') ||
          host.startsWith('10.') ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(host))
      );
    } catch {
      return false;
    }
  }

  private shouldExposeDevVerificationUrl(origin?: string): boolean {
    if (this.isTrustedLocalOrigin(origin)) return true;
    return process.env.NODE_ENV !== 'production' && !this.email.isConfigured();
  }

  private hashEmailVerificationToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
