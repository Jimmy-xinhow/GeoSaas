import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SitesService } from './sites.service';
import { ProfileEnrichmentService } from './profile-enrichment.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/guards/roles.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UseGuards } from '@nestjs/common';

@ApiTags('Sites')
@ApiBearerAuth()
@Controller('sites')
export class SitesController {
  constructor(
    private sitesService: SitesService,
    private profileEnrichment: ProfileEnrichmentService,
  ) {}

  @Post('admin/:siteId/enrich-profile')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard)
  enrichProfile(
    @Param('siteId') siteId: string,
    @Query('force') force?: string,
  ) {
    return this.profileEnrichment.enrichSite(siteId, {
      force: force === 'true' || force === '1',
    });
  }

  @Post('admin/cleanup-corrupt-names')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard)
  cleanupCorruptNames(
    @Query('industry') industry?: string,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.profileEnrichment.cleanupCorruptNames({
      industrySlug: industry,
      dryRun: dryRun === 'true' || dryRun === '1',
    });
  }

  @Get('admin/quarantined')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard)
  listQuarantined() {
    return this.profileEnrichment.listQuarantinedSites();
  }

  @Post('admin/quarantined/:siteId/restore')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard)
  restoreQuarantined(
    @Param('siteId') siteId: string,
    @Body('name') name: string,
  ) {
    return this.profileEnrichment.restoreQuarantinedSite(siteId, name);
  }

  @Post()
  create(@Body() dto: CreateSiteDto, @CurrentUser('userId') userId: string) {
    return this.sitesService.create(dto, userId);
  }

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.sitesService.findAll(userId, role);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.sitesService.findOne(id, userId, role);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.sitesService.update(id, dto, userId, role);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.sitesService.remove(id, userId, role);
  }

  // ─── Admin: Client Tagging ───

  @Patch('admin/:siteId/toggle-client')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard)
  toggleClient(
    @Param('siteId') siteId: string,
    @Body('isClient') isClient: boolean,
  ) {
    return this.sitesService.toggleClient(siteId, isClient);
  }

  @Get('admin/client-sites')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard)
  getClientSites() {
    return this.sitesService.getClientSites();
  }

  @Patch('admin/user/:userId/managed-by')
  @Roles('SUPER_ADMIN')
  @UseGuards(RolesGuard)
  setManagedBy(
    @Param('userId') userId: string,
    @Body('managedBy') managedBy: string | null,
  ) {
    return this.sitesService.setUserManagedBy(userId, managedBy);
  }
}
