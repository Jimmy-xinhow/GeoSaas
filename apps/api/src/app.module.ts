import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CustomThrottlerGuard } from './common/guards/throttler.guard';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { SitesModule } from './modules/sites/sites.module';
import { ScanModule } from './modules/scan/scan.module';
import { FixModule } from './modules/fix/fix.module';
import { ContentModule } from './modules/content/content.module';
import { MonitorModule } from './modules/monitor/monitor.module';
import { PublishModule } from './modules/publish/publish.module';
import { BillingModule } from './modules/billing/billing.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { LlmsHostingModule } from './modules/llms-hosting/llms-hosting.module';
import { DirectoryModule } from './modules/directory/directory.module';
import { CrawlerTrackingModule } from './modules/crawler-tracking/crawler-tracking.module';
import { GuestScanModule } from './modules/guest-scan/guest-scan.module';
import { IndexNowModule } from './modules/indexnow/indexnow.module';
import { BlogArticleModule } from './modules/blog-article/blog-article.module';
import { NewsModule } from './modules/news/news.module';
import { BadgeModule } from './modules/badge/badge.module';
import { SuccessCasesModule } from './modules/success-cases/success-cases.module';
import { SeedModule } from './modules/seed/seed.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { EmailModule } from './modules/email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
    PrismaModule,
    AuthModule,
    SitesModule,
    ScanModule,
    FixModule,
    ContentModule,
    MonitorModule,
    PublishModule,
    BillingModule,
    NotificationsModule,
    KnowledgeModule,
    LlmsHostingModule,
    DirectoryModule,
    CrawlerTrackingModule,
    GuestScanModule,
    IndexNowModule,
    BlogArticleModule,
    NewsModule,
    BadgeModule,
    SuccessCasesModule,
    SeedModule,
    SchedulerModule,
    EmailModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
