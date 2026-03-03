import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ScanPipelineService } from './scan-pipeline.service';

@Processor('scan')
export class ScanProcessor {
  private readonly logger = new Logger(ScanProcessor.name);

  constructor(private readonly pipeline: ScanPipelineService) {}

  @Process('analyze')
  async handleScan(job: Job<{ scanId: string; url: string }>) {
    const { scanId, url } = job.data;
    this.logger.log(`Bull job received: scan ${scanId} for ${url}`);
    await this.pipeline.executeScan(scanId, url);
  }
}
