import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';
import { CreditService } from '../billing/credit.service';
import { CreateQaDto, UpdateQaDto, BatchCreateQaDto, AiGenerateQaDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';

@ApiTags('Knowledge')
@ApiBearerAuth()
@Controller('sites/:siteId/knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly credits: CreditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all Q&A pairs for a site' })
  findAll(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.knowledgeService.findAll(siteId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a single Q&A pair' })
  create(
    @Param('siteId') siteId: string,
    @Body() dto: CreateQaDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.knowledgeService.create(siteId, dto, userId);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch create Q&A pairs' })
  batchCreate(
    @Param('siteId') siteId: string,
    @Body() dto: BatchCreateQaDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.knowledgeService.batchCreate(siteId, dto.items, userId);
  }

  @Put(':qaId')
  @ApiOperation({ summary: 'Update a Q&A pair' })
  update(
    @Param('siteId') siteId: string,
    @Param('qaId') qaId: string,
    @Body() dto: UpdateQaDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.knowledgeService.update(qaId, siteId, dto, userId);
  }

  @Delete(':qaId')
  @ApiOperation({ summary: 'Delete a Q&A pair' })
  remove(
    @Param('siteId') siteId: string,
    @Param('qaId') qaId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.knowledgeService.remove(qaId, siteId, userId);
  }

  @Post('ai-generate')
  @ApiOperation({ summary: 'AI auto-generate Q&A pairs (preview only, not saved)' })
  async aiGenerate(
    @Param('siteId') siteId: string,
    @Body() dto: AiGenerateQaDto,
    @CurrentUser('userId') userId: string,
  ) {
    const check = await this.credits.checkAndDeduct(userId, 2, '手動生成知識庫 Q&A');
    if (!check.allowed) throw new ForbiddenException(check.message);
    return this.knowledgeService.aiGenerate(siteId, userId, dto.excludeQuestions);
  }

  @Post('admin-import')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin bulk import Q&A (bypasses ownership)' })
  async adminImport(
    @Param('siteId') siteId: string,
    @Body() dto: BatchCreateQaDto,
  ) {
    return this.knowledgeService.adminBatchCreate(siteId, dto.items);
  }
}
