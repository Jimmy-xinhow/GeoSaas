import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IndustryAiService } from './industry-ai.service';

const PILOT_INDUSTRIES = ['auto_care', 'traditional_medicine'];

@Injectable()
export class IndustryAiSchedulerService {
  private readonly logger = new Logger(IndustryAiSchedulerService.name);

  constructor(private readonly service: IndustryAiService) {}

  @Cron('0 5 * * 1', { name: 'weekly-industry-ai-test' })
  async handleWeeklyTest() {
    this.logger.log('Starting weekly industry AI test...');

    for (const industry of PILOT_INDUSTRIES) {
      try {
        this.logger.log(`Testing industry: ${industry}`);
        const result = await this.service.runIndustryTest(industry);
        this.logger.log(`${industry}: ${result.tested} tests, ${result.sites} sites`);
      } catch (err) {
        this.logger.error(`Industry AI test failed for ${industry}: ${err}`);
      }
    }

    this.logger.log('Weekly industry AI test complete');
  }
}
