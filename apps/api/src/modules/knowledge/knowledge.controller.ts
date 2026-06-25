import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { KnowledgeService } from './knowledge.service';
import { CreditService } from '../billing/credit.service';
import { CreateQaDto, UpdateQaDto, BatchCreateQaDto, DeleteQasDto, AiGenerateQaDto, CommitKnowledgeImportDto } from './dto';
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
    @CurrentUser('role') role: string,
  ) {
    return this.knowledgeService.findAll(siteId, userId, role);
  }

  @Get('export.xlsx')
  @ApiOperation({ summary: 'Export all Q&A pairs for a site as an Excel file' })
  async exportXlsx(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
    @Res() res: Response,
  ) {
    const { fileName, buffer } = await this.knowledgeService.exportXlsx(siteId, userId, role);
    const encodedFileName = encodeURIComponent(fileName);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="knowledge-export.xlsx"; filename*=UTF-8''${encodedFileName}`);
    res.set('Cache-Control', 'private, no-store');
    return res.send(buffer);
  }

  @Post()
  @ApiOperation({ summary: 'Create a single Q&A pair' })
  create(
    @Param('siteId') siteId: string,
    @Body() dto: CreateQaDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.knowledgeService.create(siteId, dto, userId, role);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch create Q&A pairs' })
  batchCreate(
    @Param('siteId') siteId: string,
    @Body() dto: BatchCreateQaDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.knowledgeService.batchCreate(siteId, dto.items, userId, role);
  }

  @Get('import/quota')
  @ApiOperation({ summary: 'Get monthly AI import quota for knowledge uploads' })
  importQuota(
    @Param('siteId') siteId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.knowledgeService.getImportQuotaForSite(siteId, userId, role);
  }

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload a knowledge file and preview AI extracted Q&A drafts' })
  previewImport(
    @Param('siteId') siteId: string,
    @UploadedFile() file: any,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.knowledgeService.previewImport(siteId, file, userId, role);
  }

  @Post('import/:jobId/commit')
  @ApiOperation({ summary: 'Commit selected imported Q&A drafts into the knowledge base' })
  commitImport(
    @Param('siteId') siteId: string,
    @Param('jobId') jobId: string,
    @Body() dto: CommitKnowledgeImportDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.knowledgeService.commitImport(siteId, jobId, dto.items, userId, role);
  }

  @Put(':qaId')
  @ApiOperation({ summary: 'Update a Q&A pair' })
  update(
    @Param('siteId') siteId: string,
    @Param('qaId') qaId: string,
    @Body() dto: UpdateQaDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.knowledgeService.update(qaId, siteId, dto, userId, role);
  }

  @Post('batch-delete')
  @ApiOperation({ summary: 'Delete multiple Q&A pairs' })
  removeMany(
    @Param('siteId') siteId: string,
    @Body() dto: DeleteQasDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.knowledgeService.removeMany(dto.ids, siteId, userId, role);
  }

  @Delete(':qaId')
  @ApiOperation({ summary: 'Delete a Q&A pair' })
  remove(
    @Param('siteId') siteId: string,
    @Param('qaId') qaId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.knowledgeService.remove(qaId, siteId, userId, role);
  }

  @Post('ai-generate')
  @ApiOperation({ summary: 'AI auto-generate Q&A pairs (preview only, not saved)' })
  async aiGenerate(
    @Param('siteId') siteId: string,
    @Body() dto: AiGenerateQaDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
  ) {
    await this.knowledgeService.verifySiteOwnership(siteId, userId, role);
    const check = await this.credits.checkAndDeduct(
      userId,
      2,
      'AI knowledge Q&A generation',
    );
    this.credits.assertAllowed(check);
    return this.knowledgeService.aiGenerate(siteId, userId, dto.excludeQuestions, role);
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
