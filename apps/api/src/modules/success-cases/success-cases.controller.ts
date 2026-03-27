import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SuccessCasesService } from './success-cases.service';
import { CreateSuccessCaseDto } from './dto/create-success-case.dto';

@ApiTags('Success Cases')
@Controller('api')
export class SuccessCasesController {
  constructor(private readonly service: SuccessCasesService) {}

  @Public()
  @Get('success-cases')
  @ApiOperation({ summary: 'List approved success cases' })
  findAll(
    @Query('aiPlatform') aiPlatform?: string,
    @Query('industry') industry?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      aiPlatform: aiPlatform || undefined,
      industry: industry || undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 12,
    });
  }

  @Public()
  @Get('success-cases/featured')
  @ApiOperation({ summary: 'Get featured success cases' })
  featured() {
    return this.service.findFeatured();
  }

  @Public()
  @Get('success-cases/:id')
  @ApiOperation({ summary: 'Get success case by ID' })
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @ApiBearerAuth()
  @Post('success-cases')
  @ApiOperation({ summary: 'Submit a new success case' })
  create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateSuccessCaseDto,
  ) {
    return this.service.create(userId, dto);
  }

  @ApiBearerAuth()
  @Patch('admin/success-cases/:id/approve')
  @ApiOperation({ summary: 'Approve a success case (admin)' })
  approve(@Param('id') id: string) {
    return this.service.approve(id);
  }

  @ApiBearerAuth()
  @Patch('admin/success-cases/:id/reject')
  @ApiOperation({ summary: 'Reject a success case (admin)' })
  reject(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.service.reject(id, body.reason);
  }
}
