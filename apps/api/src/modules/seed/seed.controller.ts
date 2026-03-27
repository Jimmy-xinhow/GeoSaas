import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SeedService } from './seed.service';

@ApiTags('Admin — Seed')
@ApiBearerAuth()
@Controller('api/admin/seed')
export class SeedController {
  constructor(private readonly service: SeedService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get seeding status overview' })
  status() {
    return this.service.getStatus();
  }

  @Get('failed')
  @ApiOperation({ summary: 'Get all failed seed sources' })
  failed() {
    return this.service.getFailed();
  }

  @Post('import')
  @ApiOperation({ summary: 'Import CSV files into SeedSource' })
  async importCsv(@Body() body: { files?: string[] }) {
    return this.service.importCsvFiles(body.files);
  }

  @Post('run')
  @ApiOperation({ summary: 'Start scanning pending seeds (async)' })
  async run() {
    // Fire-and-forget
    this.service.runScanning().catch((err) => {
      console.error('Seed scanning failed:', err);
    });
    return { message: 'Scanning started' };
  }

  @Post('retry-failed')
  @ApiOperation({ summary: 'Reset all failed seeds to pending and rescan' })
  async retryFailed() {
    const result = await this.service.retryFailed();
    // Then trigger scanning
    this.service.runScanning().catch((err) => {
      console.error('Retry scanning failed:', err);
    });
    return { ...result, message: 'Reset and rescanning started' };
  }
}
