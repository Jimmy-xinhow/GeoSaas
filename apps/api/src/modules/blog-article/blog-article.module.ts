import { Module } from '@nestjs/common';
import { AdminBlogController, BlogArticleController } from './blog-article.controller';
import { BlogArticleService } from './blog-article.service';
import { BlogTemplateService } from './blog-template.service';
import { BrandFactService } from './brand-fact.service';
import { BrandProfileService } from './brand-profile.service';
import { FaqArticleService } from './faq-article.service';
import { IndustryInsightService } from './industry-insight.service';
import { IndexNowModule } from '../indexnow/indexnow.module';
import { LlmsHostingModule } from '../llms-hosting/llms-hosting.module';
import { SitesModule } from '../sites/sites.module';
import { ContentQualityModule } from '../content-quality/content-quality.module';
import { CitationReadinessModule } from '../citation-readiness/citation-readiness.module';
import { ArticlePublishPackageService } from './article-publish-package.service';
import { LegacyContentReplacementService } from './legacy-content-replacement.service';

@Module({
  imports: [IndexNowModule, LlmsHostingModule, SitesModule, ContentQualityModule, CitationReadinessModule],
  controllers: [BlogArticleController, AdminBlogController],
  providers: [BlogArticleService, BlogTemplateService, BrandFactService, BrandProfileService, FaqArticleService, IndustryInsightService, ArticlePublishPackageService, LegacyContentReplacementService],
  exports: [BlogArticleService, BrandFactService, BrandProfileService, FaqArticleService, IndustryInsightService, LegacyContentReplacementService],
})
export class BlogArticleModule {}
