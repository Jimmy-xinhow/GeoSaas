import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.ensureAdminUser();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Ensure default admin account exists on every startup */
  private async ensureAdminUser() {
    const email = process.env.ADMIN_EMAIL || 'admin@geovault.app';
    const password = process.env.ADMIN_PASSWORD || 'Geovault2026';

    try {
      const existing = await this.user.findUnique({ where: { email } });
      if (!existing) {
        const passwordHash = await bcrypt.hash(password, 10);
        await this.user.create({
          data: {
            email,
            name: 'Admin',
            passwordHash,
            role: 'SUPER_ADMIN',
            plan: 'PRO',
          },
        });
        this.logger.log(`Admin user created: ${email}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to ensure admin user: ${err}`);
    }
  }
}
