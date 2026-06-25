import { Module } from '@nestjs/common';
import { AdminBlogController, BlogArticleController } from './blog-article.controller';
import { BlogArticleService } from './blog-article.service';
import { BlogTemplateService } from './blog-template.service';
import { BrandFactService } from './brand-fact.service';
import { IndustryInsightService } from './industry-insight.service';
import { IndexNowModule } from '../indexnow/indexnow.module';
import { LlmsHostingModule } from '../llms-hosting/llms-hosting.module';
import { SitesModule } from '../sites/sites.module';
import { ContentQualityModule } from '../content-quality/content-quality.module';

@Module({
  imports: [IndexNowModule, LlmsHostingModule, SitesModule, ContentQualityModule],
  controllers: [BlogArticleController, AdminBlogController],
  providers: [BlogArticleService, BlogTemplateService, BrandFactService, IndustryInsightService],
  exports: [BlogArticleService, BrandFactService, IndustryInsightService],
})
export class BlogArticleModule {}
