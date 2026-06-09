import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { INDUSTRY_AI_PLATFORMS, IndustryAiService } from './industry-ai.service';

const PILOT_INDUSTRIES = ['auto_care', 'traditional_medicine'];
type IndustryAiPlatform = (typeof INDUSTRY_AI_PLATFORMS)[number];

@Injectable()
export class IndustryAiSchedulerService {
  private readonly logger = new Logger(IndustryAiSchedulerService.name);

  constructor(
    private readonly service: IndustryAiService,
    private readonly config: ConfigService,
  ) {}

  private getNumber(name: string, fallback: number): number {
    const raw = this.config.get<string>(name);
    const parsed = raw ? Number(raw) : fallback;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  private getIndustries(): string[] {
    const raw = this.config.get<string>('INDUSTRY_AI_SCHEDULED_INDUSTRIES');
    return (raw ? raw.split(',') : PILOT_INDUSTRIES)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private getPlatforms(): IndustryAiPlatform[] {
    const raw = this.config.get<string>('INDUSTRY_AI_SCHEDULED_PLATFORMS');
    const requested = (raw ? raw.split(',') : [...INDUSTRY_AI_PLATFORMS])
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    const allowed = new Set<string>(INDUSTRY_AI_PLATFORMS);
    const platforms = requested.filter((value): value is IndustryAiPlatform => allowed.has(value));

    if (this.config.get<string>('INDUSTRY_AI_ENABLE_COPILOT', '1') === '0') {
      return platforms.filter((platform) => platform !== 'COPILOT');
    }

    return platforms;
  }

  @Cron('0 5 * * 1', { name: 'weekly-industry-ai-test' })
  async handleWeeklyTest() {
    if (this.config.get<string>('INDUSTRY_AI_SCHEDULED_ENABLED', '1') === '0') {
      this.logger.log('Weekly industry AI test skipped: INDUSTRY_AI_SCHEDULED_ENABLED=0');
      return;
    }

    this.logger.log('Starting weekly industry AI test...');

    const options = {
      maxSites: this.getNumber('INDUSTRY_AI_SCHEDULED_MAX_SITES_PER_INDUSTRY', 20),
      maxQueries: this.getNumber('INDUSTRY_AI_SCHEDULED_MAX_QUERIES_PER_INDUSTRY', 4),
      maxTotalCalls: this.getNumber('INDUSTRY_AI_SCHEDULED_MAX_CALLS_PER_INDUSTRY', 500),
      maxCopilotCalls: this.getNumber('INDUSTRY_AI_SCHEDULED_MAX_COPILOT_CALLS_PER_INDUSTRY', 80),
      platforms: this.getPlatforms(),
      label: 'weekly-scheduled',
    };

    this.logger.log(
      `Weekly industry AI limits: ${options.maxSites} sites/industry, ${options.maxQueries} queries/industry, ${options.platforms.join(',') || 'no platforms'}, ${options.maxTotalCalls} calls/industry, ${options.maxCopilotCalls} Copilot calls/industry`,
    );

    for (const industry of this.getIndustries()) {
      try {
        this.logger.log(`Testing industry: ${industry}`);
        const result = await this.service.runIndustryTest(industry, options);
        this.logger.log(
          `${industry}: ${result.tested} new tests, ${result.sites} sites, ${result.queries} queries, ${result.plannedCalls} planned, ${result.skippedByBudget} budget skipped`,
        );
      } catch (err) {
        this.logger.error(`Industry AI test failed for ${industry}: ${err}`);
      }
    }

    this.logger.log('Weekly industry AI test complete');
  }
}
