import { BadRequestException, Body, Controller, Get, Patch, Post, Query, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';
import { AffiliateService } from './affiliate.service';
import {
  ApplyAffiliateDto,
  ProcessWithdrawalDto,
  RequestWithdrawalDto,
  ReviewAffiliateDto,
  TrackAffiliateClickDto,
  UpdateAffiliateSettingsDto,
  UpdateAffiliateTierDto,
} from './dto/affiliate.dto';

@ApiTags('Affiliate')
@Controller()
export class AffiliateController {
  constructor(private readonly service: AffiliateService) {}

  @Public()
  @Post('affiliate/track-click')
  trackClick(@Body() dto: TrackAffiliateClickDto, @Req() req: Request) {
    return this.service.recordClick(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @ApiBearerAuth()
  @Get('affiliate/my-status')
  getMyStatus(@CurrentUser('userId') userId: string) {
    return this.service.getMyStatus(userId);
  }

  @ApiBearerAuth()
  @Post('affiliate/apply')
  apply(@CurrentUser('userId') userId: string, @Body() dto: ApplyAffiliateDto) {
    return this.service.submitApplication(userId, dto);
  }

  @ApiBearerAuth()
  @Get('affiliate/dashboard')
  dashboard(@CurrentUser('userId') userId: string) {
    return this.service.getDashboard(userId);
  }

  @ApiBearerAuth()
  @Get('affiliate/commissions')
  commissions(
    @CurrentUser('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getCommissions(userId, this.parseInt(page, 1, 10000), this.parseInt(limit, 20, 100));
  }

  @ApiBearerAuth()
  @Get('affiliate/withdrawals')
  withdrawals(
    @CurrentUser('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getWithdrawals(userId, this.parseInt(page, 1, 10000), this.parseInt(limit, 20, 100));
  }

  @ApiBearerAuth()
  @Post('affiliate/withdrawals')
  requestWithdrawal(@CurrentUser('userId') userId: string, @Body() dto: RequestWithdrawalDto) {
    return this.service.requestWithdrawal(userId, dto);
  }

  @ApiBearerAuth()
  @Get('affiliate/tracking-link')
  trackingLink(@CurrentUser('userId') userId: string) {
    return this.service.getTrackingLink(userId);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('admin/affiliates/overview')
  adminOverview() {
    return this.service.getAdminOverview();
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('admin/affiliates/settings')
  adminSettings() {
    return this.service.getAdminSettings();
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('admin/affiliates/settings')
  updateAdminSettings(@Body() dto: UpdateAffiliateSettingsDto) {
    return this.service.updateAdminSettings(dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('admin/affiliates')
  adminAffiliates(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listAdminAffiliates(
      this.normalizeStatus(status),
      this.parseInt(page, 1, 10000),
      this.parseInt(limit, 20, 100),
    );
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('admin/affiliates/commissions')
  adminCommissions(
    @Query('affiliateId') affiliateId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listAdminCommissions(
      affiliateId,
      this.parseInt(page, 1, 10000),
      this.parseInt(limit, 20, 100),
    );
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('admin/affiliates/withdrawals')
  adminWithdrawals(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listAdminWithdrawals(
      this.normalizeWithdrawalStatus(status),
      this.parseInt(page, 1, 10000),
      this.parseInt(limit, 20, 100),
    );
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('admin/affiliates/tax-report')
  taxReport(@Query('year') year?: string) {
    return this.service.getTaxReport(this.parseInt(year, new Date().getFullYear(), 2100));
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('admin/affiliates/:id/review')
  review(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: ReviewAffiliateDto,
  ) {
    return this.service.reviewAffiliate(id, userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('admin/affiliates/:id/tier')
  tier(@Param('id') id: string, @Body() dto: UpdateAffiliateTierDto) {
    return this.service.updateTier(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('admin/affiliates/:id/suspend')
  suspend(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.service.suspend(id, userId);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('admin/affiliates/withdrawals/:id')
  processWithdrawal(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: ProcessWithdrawalDto,
  ) {
    return this.service.processWithdrawal(id, userId, dto);
  }

  private parseInt(value: string | undefined, fallback: number, max: number): number {
    if (!value) return fallback;
    if (!/^\d+$/.test(value)) throw new BadRequestException('Invalid numeric query');
    const parsed = Number(value);
    if (parsed < 1 || parsed > max) throw new BadRequestException('Invalid numeric query');
    return parsed;
  }

  private normalizeStatus(status?: string): string | undefined {
    if (!status) return undefined;
    const normalized = status.trim().toLowerCase();
    if (!['pending', 'approved', 'rejected', 'suspended'].includes(normalized)) {
      throw new BadRequestException('Invalid status');
    }
    return normalized;
  }

  private normalizeWithdrawalStatus(status?: string): string | undefined {
    if (!status) return undefined;
    const normalized = status.trim().toLowerCase();
    if (!['pending', 'processing', 'completed', 'rejected'].includes(normalized)) {
      throw new BadRequestException('Invalid withdrawal status');
    }
    return normalized;
  }
}
