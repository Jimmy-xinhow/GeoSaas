import { Controller, Get, Post, Param, Body, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ClientReportService } from './client-report.service';

@ApiTags('Client Reports')
@ApiBearerAuth()
@Controller('client-reports')
export class ClientReportController {
  constructor(private readonly service: ClientReportService) {}

  @Post('query-sets')
  @ApiOperation({ summary: 'Create/update a client query set' })
  upsertQuerySet(@Body() body: { siteId: string; name: string; queries: { category: string; question: string }[] }) {
    return this.service.upsertQuerySet(body.siteId, body.name, body.queries);
  }

  @Get('query-sets/:siteId')
  @ApiOperation({ summary: 'Get query sets for a site' })
  getQuerySets(@Param('siteId') siteId: string) {
    return this.service.getQuerySets(siteId);
  }

  @Post('run/:querySetId')
  @ApiOperation({ summary: 'Run a full report (all questions × all platforms)' })
  runReport(@Param('querySetId') querySetId: string) {
    return this.service.runReport(querySetId);
  }

  @Get('reports/:siteId')
  @ApiOperation({ summary: 'Get all reports for a site' })
  getReports(@Param('siteId') siteId: string) {
    return this.service.getReports(siteId);
  }

  @Get('report/:reportId')
  @ApiOperation({ summary: 'Get a single report' })
  getReport(@Param('reportId') reportId: string) {
    return this.service.getReport(reportId);
  }

  @Get('report/:reportId/html')
  @ApiOperation({ summary: 'Get report as HTML (for PDF download)' })
  async getReportHtml(@Param('reportId') reportId: string, @Res() res: Response) {
    const html = await this.service.getReportHtml(reportId);
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
}
