import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from './crawler/crawler.service';
import { ParserService } from './crawler/parser.service';
import { ScoringService } from './scoring/scoring.service';
import { JsonLdIndicator } from './indicators/json-ld.indicator';
import { LlmsTxtIndicator } from './indicators/llms-txt.indicator';
import { OgTagsIndicator } from './indicators/og-tags.indicator';
import { MetaDescriptionIndicator } from './indicators/meta-description.indicator';
import { FaqSchemaIndicator } from './indicators/faq-schema.indicator';
import { TitleOptimizationIndicator } from './indicators/title-optimization.indicator';
import { ContactInfoIndicator } from './indicators/contact-info.indicator';
import { ImageAltIndicator } from './indicators/image-alt.indicator';
import { IIndicatorAnalyzer, IndicatorResult, AnalysisInput } from './indicators/indicator.interface';

@Injectable()
export class ScanPipelineService {
  private readonly logger = new Logger(ScanPipelineService.name);
  private readonly indicators: IIndicatorAnalyzer[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawler: CrawlerService,
    private readonly parser: ParserService,
    private readonly scoring: ScoringService,
    private readonly jsonLd: JsonLdIndicator,
    private readonly llmsTxt: LlmsTxtIndicator,
    private readonly ogTags: OgTagsIndicator,
    private readonly metaDescription: MetaDescriptionIndicator,
    private readonly faqSchema: FaqSchemaIndicator,
    private readonly titleOptimization: TitleOptimizationIndicator,
    private readonly contactInfo: ContactInfoIndicator,
    private readonly imageAlt: ImageAltIndicator,
  ) {
    this.indicators = [
      this.jsonLd,
      this.llmsTxt,
      this.ogTags,
      this.metaDescription,
      this.faqSchema,
      this.titleOptimization,
      this.contactInfo,
      this.imageAlt,
    ];
  }

  /**
   * Execute the full scan pipeline for a given scan ID and URL.
   * This method is used both by the Bull processor and the synchronous fallback.
   */
  async executeScan(scanId: string, url: string): Promise<void> {
    this.logger.log(`Starting scan ${scanId} for ${url}`);

    // Update status to RUNNING
    await this.prisma.scan.update({
      where: { id: scanId },
      data: { status: 'RUNNING' },
    });

    try {
      // Step 1: Crawl the page and fetch llms.txt in parallel
      const [crawlResult, llmsTxtContent] = await Promise.all([
        this.crawler.crawl(url),
        this.crawler.fetchLlmsTxt(url),
      ]);

      // Step 2: Parse the HTML
      const $ = this.parser.load(crawlResult.html);
      const input: AnalysisInput = {
        url,
        html: crawlResult.html,
        $,
        headers: crawlResult.headers,
        llmsTxt: llmsTxtContent,
      };

      // Step 3: Run all indicators, handling errors individually
      const resultsMap = new Map<string, IndicatorResult>();

      const analyzePromises = this.indicators.map(async (indicator) => {
        try {
          const result = await indicator.analyze(input);
          resultsMap.set(indicator.name, result);
        } catch (error) {
          this.logger.warn(
            `Indicator "${indicator.name}" failed for scan ${scanId}: ${error}`,
          );
          // Create a fail result for indicators that error out
          resultsMap.set(indicator.name, {
            score: 0,
            status: 'fail',
            details: {
              error: true,
              message: error instanceof Error ? error.message : String(error),
            },
            suggestion: `分析 ${indicator.name} 時發生錯誤，請重新掃描或聯繫支援。`,
            autoFixable: false,
          });
        }
      });

      await Promise.all(analyzePromises);

      // Step 4: Calculate total weighted score
      const totalScore = this.scoring.calculateTotalScore(resultsMap);

      // Step 5: Save all results and update scan in a transaction
      await this.prisma.$transaction([
        // Create ScanResult records for each indicator
        ...Array.from(resultsMap.entries()).map(([name, result]) =>
          this.prisma.scanResult.create({
            data: {
              scanId,
              indicator: name,
              score: result.score,
              status: result.status,
              details: result.details as any,
              suggestion: result.suggestion || null,
              autoFixable: result.autoFixable,
              generatedCode: result.generatedCode || null,
            },
          }),
        ),
        // Update the scan record with total score and completed status
        this.prisma.scan.update({
          where: { id: scanId },
          data: {
            totalScore,
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        }),
      ]);

      // Update bestScore if this score is higher
      const scan = await this.prisma.scan.findUnique({
        where: { id: scanId },
        select: { siteId: true },
      });
      if (scan) {
        const site = await this.prisma.site.findUnique({
          where: { id: scan.siteId },
          select: { bestScore: true },
        });
        if (site && totalScore > site.bestScore) {
          await this.prisma.site.update({
            where: { id: scan.siteId },
            data: { bestScore: totalScore, bestScoreAt: new Date() },
          });
        }
      }

      this.logger.log(`Scan ${scanId} completed with score ${totalScore}`);
    } catch (error) {
      this.logger.error(`Scan ${scanId} failed: ${error}`);
      await this.prisma.scan.update({
        where: { id: scanId },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }
}
