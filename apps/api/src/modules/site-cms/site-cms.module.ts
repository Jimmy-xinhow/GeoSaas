import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { SiteCmsAuthGuard } from './site-cms-auth.guard';
import { SiteCmsController } from './site-cms.controller';
import { SiteCmsService } from './site-cms.service';

@Module({
  imports: [UploadModule],
  controllers: [SiteCmsController],
  providers: [SiteCmsService, SiteCmsAuthGuard],
  exports: [SiteCmsService],
})
export class SiteCmsModule {}
