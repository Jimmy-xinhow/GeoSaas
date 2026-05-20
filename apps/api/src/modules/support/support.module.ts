import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SupportController, AdminSupportController } from './support.controller';
import { SupportIntegrationService } from './support-integration.service';
import { SupportRealtimeGateway } from './support-realtime.gateway';
import { SupportService } from './support.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService, SupportIntegrationService, SupportRealtimeGateway],
  exports: [SupportService],
})
export class SupportModule {}
