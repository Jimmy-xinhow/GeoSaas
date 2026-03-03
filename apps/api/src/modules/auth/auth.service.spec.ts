import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock } };
  let jwtService: { signAsync: jest.Mock; verify: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-token'),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-secret') } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should create a new user and return tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: '1', email: 'test@test.com', name: 'Test', role: 'USER', plan: 'FREE', createdAt: new Date(),
      });

      const result = await service.register({ email: 'test@test.com', password: 'password123', name: 'Test' });

      expect(result.user.email).toBe('test@test.com');
      expect(result.token).toBe('mock-token');
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: '1', email: 'test@test.com' });

      await expect(service.register({ email: 'test@test.com', password: 'password123' }))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return user and tokens on valid credentials', async () => {
      const hash = await bcrypt.hash('password123', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: '1', email: 'test@test.com', name: 'Test', passwordHash: hash, role: 'USER', plan: 'FREE',
      });

      const result = await service.login({ email: 'test@test.com', password: 'password123' });

      expect(result.user.email).toBe('test@test.com');
      expect(result.token).toBe('mock-token');
    });

    it('should throw UnauthorizedException on invalid email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: 'wrong@test.com', password: 'password123' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      const hash = await bcrypt.hash('correctpass', 10);
      prisma.user.findUnique.mockResolvedValue({
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

      const result = await service.updateProfile('1', { name: 'New Name', email: 'new@test.com' });

      expect(result.name).toBe('New Name');
    });

    it('should throw ConflictException if email is taken', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: '2', email: 'taken@test.com' });

      await expect(service.updateProfile('1', { email: 'taken@test.com' }))
        .rejects.toThrow(ConflictException);
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
});
