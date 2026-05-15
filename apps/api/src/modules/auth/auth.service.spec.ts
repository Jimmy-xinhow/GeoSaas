import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: { signAsync: jest.Mock; verify: jest.Mock };
  let email: { sendPasswordReset: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      passwordResetToken: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-token'),
      verify: jest.fn(),
    };
    email = {
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-secret') } },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({}) } },
        { provide: EmailService, useValue: email },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should create a new user and return tokens', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: '1', email: 'test@test.com', name: 'Test', role: 'USER', plan: 'FREE', createdAt: new Date(),
      });

      const result = await service.register({ email: ' TEST@Test.com ', password: 'password123', name: ' Test ' });

      expect(result.user.email).toBe('test@test.com');
      expect(result.token).toBe('mock-token');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'test@test.com', name: 'Test' }),
        }),
      );
    });

    it('should throw ConflictException if email already exists', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: '1', email: 'test@test.com' });

      await expect(service.register({ email: 'TEST@test.com', password: 'password123' }))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return user and tokens on valid credentials', async () => {
      const hash = await bcrypt.hash('password123', 10);
      prisma.user.findFirst.mockResolvedValue({
        id: '1', email: 'test@test.com', name: 'Test', passwordHash: hash, role: 'USER', plan: 'FREE',
      });

      const result = await service.login({ email: ' TEST@Test.com ', password: 'password123' });

      expect(result.user.email).toBe('test@test.com');
      expect(result.token).toBe('mock-token');
    });

    it('should throw UnauthorizedException on invalid email', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.login({ email: 'wrong@test.com', password: 'password123' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      const hash = await bcrypt.hash('correctpass', 10);
      prisma.user.findFirst.mockResolvedValue({
        id: '1', email: 'test@test.com', passwordHash: hash, role: 'USER',
      });

      await expect(service.login({ email: 'test@test.com', password: 'wrongpass' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('updateProfile', () => {
    it('should update user profile', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({
        id: '1', email: 'new@test.com', name: 'New Name', role: 'USER', plan: 'FREE', avatarUrl: null, createdAt: new Date(),
      });

      const result = await service.updateProfile('1', { name: ' New Name ', email: ' NEW@test.com ' });

      expect(result.name).toBe('New Name');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { email: 'new@test.com', name: 'New Name' },
        }),
      );
    });

    it('should throw ConflictException if email is taken', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: '2', email: 'taken@test.com' });

      await expect(service.updateProfile('1', { email: 'taken@test.com' }))
        .rejects.toThrow(ConflictException);
    });

    it('should reject blank profile names', async () => {
      await expect(service.updateProfile('1', { name: '   ' }))
        .rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('should change password with correct current password', async () => {
      const hash = await bcrypt.hash('oldpass123', 10);
      prisma.user.findUnique.mockResolvedValue({ id: '1', passwordHash: hash });
      prisma.user.update.mockResolvedValue({});

      const result = await service.changePassword('1', 'oldpass123', 'newpass456');

      expect(result.message).toBe('Password updated successfully');
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on wrong current password', async () => {
      const hash = await bcrypt.hash('correct', 10);
      prisma.user.findUnique.mockResolvedValue({ id: '1', passwordHash: hash });

      await expect(service.changePassword('1', 'wrong', 'newpass'))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('should return generic message without revealing missing accounts', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.forgotPassword('missing@test.com');

      expect(result.message).toContain('如果此 email 已註冊');
      expect(email.sendPasswordReset).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('should create one-time reset token and send reset email', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: '1', email: 'test@test.com' });

      const result = await service.forgotPassword(' TEST@Test.com ');

      expect(result.message).toContain('如果此 email 已註冊');
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: '1', usedAt: null },
      });
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: '1',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      });
      expect(email.sendPasswordReset).toHaveBeenCalledWith(
        'test@test.com',
        expect.stringContaining('/reset-password?token='),
      );
    });
  });

  describe('resetPassword', () => {
    it('should reject invalid tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('bad-token', 'newpass123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should update password and mark token used', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userId: '1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      });
      prisma.user.update.mockResolvedValue({});
      prisma.passwordResetToken.update.mockResolvedValue({});
      prisma.passwordResetToken.deleteMany.mockResolvedValue({});

      const result = await service.resetPassword('valid-token', 'newpass123');

      expect(result.message).toContain('密碼已更新');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { passwordHash: expect.any(String) },
      });
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: { usedAt: expect.any(Date) },
      });
    });
  });
});
