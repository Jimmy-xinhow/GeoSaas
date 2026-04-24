import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private notifications: NotificationsService,
  ) {
    this.googleClient = new OAuth2Client(this.config.get('GOOGLE_CLIENT_ID'));
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name },
      select: { id: true, email: true, name: true, role: true, plan: true, createdAt: true },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Send welcome notification + email (non-blocking)
    this.notifications.create(user.id, 'welcome', '歡迎加入 Geovault', `${user.name || '使用者'}，感謝您註冊 Geovault！`).catch(() => {});

    return { user, ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

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

  async loginWithGoogle(idToken: string) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new UnauthorizedException('Google login not configured');

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: clientId,
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

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, plan: true, avatarUrl: true, createdAt: true },
    });
  }

  async updateProfile(userId: string, data: { name?: string; email?: string }) {
    if (data.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: data.email, id: { not: userId } },
      });
      if (existing) throw new ConflictException('Email already in use');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data,
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
}
