import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { ScanModule } from '../scan/scan.module';
import { IndexNowModule } from '../indexnow/indexnow.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [ConfigModule, ScanModule, IndexNowModule, PrismaModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
