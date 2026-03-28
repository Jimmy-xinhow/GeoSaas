import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { DiscoveryService } from './discovery.service';

@ApiTags('Admin — Discovery')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('admin/discovery')
export class DiscoveryController {
  constructor(private readonly service: DiscoveryService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get auto-discovery status' })
  status() {
    return this.service.getStatus();
  }

  @Post('run')
  @ApiOperation({ summary: 'Manually trigger business discovery' })
  async run() {
    this.service.discoverBusinesses().catch((err) => {
      console.error('Discovery failed:', err);
    });
    return { message: 'Discovery started' };
  }

  @Post('enrich')
  @ApiOperation({ summary: 'Manually trigger content enrichment' })
  async enrich() {
    this.service.enrichIndustryContent().catch((err) => {
      console.error('Enrichment failed:', err);
    });
    return { message: 'Enrichment started' };
  }
}
