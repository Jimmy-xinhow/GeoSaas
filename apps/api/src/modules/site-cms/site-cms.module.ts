import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { SiteCmsAuthGuard } from './site-cms-auth.guard';
import { SiteCmsController } from './site-cms.controller';
import { SiteCmsContentService } from './site-cms-content.service';
import { SiteCmsService } from './site-cms.service';

@Module({
  imports: [UploadModule],
  controllers: [SiteCmsController],
  providers: [SiteCmsService, SiteCmsContentService, SiteCmsAuthGuard],
  exports: [SiteCmsService],
})
export class SiteCmsModule {}
