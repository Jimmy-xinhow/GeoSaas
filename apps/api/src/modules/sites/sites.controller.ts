import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Sites')
@ApiBearerAuth()
@Controller('sites')
export class SitesController {
  constructor(private sitesService: SitesService) {}

  @Post()
  create(@Body() dto: CreateSiteDto, @CurrentUser('userId') userId: string) {
    return this.sitesService.create(dto, userId);
  }

  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    return this.sitesService.findAll(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.sitesService.findOne(id, userId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSiteDto, @CurrentUser('userId') userId: string) {
    return this.sitesService.update(id, dto, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.sitesService.remove(id, userId);
  }
}
