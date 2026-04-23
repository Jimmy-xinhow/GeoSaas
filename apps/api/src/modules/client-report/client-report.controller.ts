import { Controller, Get, Post, Delete, Param, Body, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClientReportService } from './client-report.service';

@ApiTags('Client Reports')
@ApiBearerAuth()
@Controller('client-reports')
export class ClientReportController {
  constructor(private readonly service: ClientReportService) {}

  @Post('query-sets')
  @ApiOperation({ summary: 'Create/update a client query set' })
  async upsertQuerySet(
    @Body() body: { siteId: string; name: string; queries: { category: string; question: string }[] },
    @CurrentUser('role') role: string,
  ) {
    await this.service.assertSiteAccess(body.siteId, role);
    return this.service.upsertQuerySet(body.siteId, body.name, body.queries);
  }

  @Get('query-sets/:siteId')
  @ApiOperation({ summary: 'Get query sets for a site' })
  async getQuerySets(
    @Param('siteId') siteId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.service.assertSiteAccess(siteId, role);
    return this.service.getQuerySets(siteId);
  }

  @Post('run/:querySetId')
  @ApiOperation({ summary: 'Run a full report (all questions × all platforms)' })
  runReport(
    @Param('querySetId') querySetId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.runReport(querySetId, role, userId);
  }

  @Get('quota/:siteId')
  @ApiOperation({
    summary:
      'Quota + cooldown status for the acceptance-report UI: monthly used/limit, per-querySet 4h cooldown, bypass flag for staff.',
  })
  async getQuota(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.service.assertSiteAccess(siteId, role);
    return this.service.getQuotaStatus(siteId, userId);
  }

  @Get('reports/:siteId')
  @ApiOperation({ summary: 'Get all reports for a site' })
  async getReports(
    @Param('siteId') siteId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.service.assertSiteAccess(siteId, role);
    return this.service.getReports(siteId);
  }

  @Get('report/:reportId')
  @ApiOperation({ summary: 'Get a single report' })
  async getReport(
    @Param('reportId') reportId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.service.assertReportAccess(reportId, role);
    return this.service.getReport(reportId);
  }

  @Delete('report/:reportId')
  @ApiOperation({ summary: 'Delete a report' })
  async deleteReport(
    @Param('reportId') reportId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.service.assertReportAccess(reportId, role);
    return this.service.deleteReport(reportId);
  }

  @Public()
  @Get('report/:reportId/html')
  @ApiOperation({ summary: 'Get report as HTML (for PDF download)' })
  async getReportHtml(@Param('reportId') reportId: string, @Res() res: Response) {
    const html = await this.service.getReportHtml(reportId);
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  @Get('geo-comprehensive/:siteId')
  @ApiOperation({
    summary:
      'GEO 綜合體檢 — aggregated scan trend, indicator breakdown, crawler activity, content-asset coverage, and industry peer comparison for one site. Powers the new "GEO 分數 / 爬蟲活動 / 內容資產 / 競品" tabs on the report page.',
  })
  async getGeoComprehensive(
    @Param('siteId') siteId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.service.assertSiteAccess(siteId, role);
    return this.service.getGeoComprehensive(siteId);
  }

  @Public()
  @Get('complete/:siteId/html')
  @ApiOperation({
    summary:
      '完整 GEO 報告 HTML (GEO 綜合體檢 + 最新 AI 引用驗收). 使用者用瀏覽器 Ctrl+P 可存成 PDF。Public endpoint 以便直接在新分頁開啟列印。',
  })
  async getCompleteHtml(
    @Param('siteId') siteId: string,
    @Res() res: Response,
  ) {
    const html = await this.service.getCompleteReportHtml(siteId);
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  @Get('complete/:siteId/csv')
  @ApiOperation({
    summary:
      '完整 GEO 報告 CSV — 所有區塊(overview / scanTrend / indicators / crawler / peers / citation results)逐段輸出,給分析人員丟進 Excel 做樞紐分析。UTF-8 BOM 避開中文亂碼。',
  })
  async getCompleteCsv(
    @Param('siteId') siteId: string,
    @CurrentUser('role') role: string,
    @Res() res: Response,
  ) {
    await this.service.assertSiteAccess(siteId, role);
    const csv = await this.service.getCompleteReportCsv(siteId);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="geovault-report-${siteId}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  }
}
