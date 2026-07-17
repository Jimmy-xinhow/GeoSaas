import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { BlogArticleModule } from '../blog-article/blog-article.module';
import { IndexNowModule } from '../indexnow/indexnow.module';
import { OfficialSiteContentController } from './official-site-content.controller';
import { OfficialSiteContentService } from './official-site-content.service';

@Module({
  imports: [BillingModule, BlogArticleModule, IndexNowModule],
  controllers: [OfficialSiteContentController],
  providers: [OfficialSiteContentService],
  exports: [OfficialSiteContentService],
})
export class OfficialSiteContentModule {}
