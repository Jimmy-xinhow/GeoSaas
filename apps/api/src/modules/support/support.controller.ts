import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';
import {
  AssignSupportConversationDto,
  CreateSupportConversationDto,
  QuerySupportConversationsDto,
  SendSupportMessageDto,
  UpsertSupportKnowledgeDto,
} from './dto/support.dto';
import { SupportIntegrationService } from './support-integration.service';
import { SupportService } from './support.service';

@ApiTags('Support')
@ApiBearerAuth()
@Controller()
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly integrations: SupportIntegrationService,
  ) {}

  @Post('support/conversations')
  @ApiOperation({ summary: 'Create a support conversation' })
  createConversation(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateSupportConversationDto,
  ) {
    return this.support.createConversation(userId, dto);
  }

  @Get('support/conversations')
  @ApiOperation({ summary: 'List my support conversations' })
  listMine(@CurrentUser('userId') userId: string) {
    return this.support.listUserConversations(userId);
  }

  @Get('support/conversations/:id')
  @ApiOperation({ summary: 'Get my support conversation' })
  getMine(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.support.getConversationForUser(userId, id);
  }

  @Get('support/conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages in my support conversation' })
  getMyMessages(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.support.getUserMessages(userId, id);
  }

  @Post('support/conversations/:id/messages')
  @ApiOperation({ summary: 'Send a support message' })
  sendMyMessage(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: SendSupportMessageDto,
  ) {
    return this.support.sendUserMessage(userId, id, dto);
  }

  @Public()
  @Post('support/integrations/telegram/webhook')
  @ApiOperation({ summary: 'Telegram support reply webhook' })
  async telegramWebhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() payload: any,
  ) {
    if (!this.integrations.verifyTelegramSecret(secret)) return { ok: false };
    const command = this.integrations.parseReplyCommand(this.integrations.extractTelegramText(payload));
    if (!command) return { ok: true, ignored: true };
    await this.support.sendExternalStaffReply(command.conversationId, command.body);
    return { ok: true };
  }

  @Public()
  @Post('support/integrations/lark/webhook')
  @ApiOperation({ summary: 'Lark support reply webhook' })
  async larkWebhook(
    @Headers('x-support-webhook-secret') secret: string | undefined,
    @Body() payload: any,
  ) {
    if (payload?.challenge) return { challenge: payload.challenge };
    if (!this.integrations.verifyLarkSecret(secret)) return { ok: false };
    const command = this.integrations.parseReplyCommand(this.integrations.extractLarkText(payload));
    if (!command) return { ok: true, ignored: true };
    await this.support.sendExternalStaffReply(command.conversationId, command.body);
    return { ok: true };
  }
}

@ApiTags('Admin Support')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('STAFF', 'ADMIN', 'SUPER_ADMIN')
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List support conversations for admins' })
  list(@Query() query: QuerySupportConversationsDto) {
    return this.support.listAdminConversations(query);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get support conversation messages for admins' })
  messages(@Param('id') id: string) {
    return this.support.getAdminMessages(id);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Admin reply to support conversation' })
  reply(
    @CurrentUser('userId') adminId: string,
    @Param('id') id: string,
    @Body() dto: SendSupportMessageDto,
  ) {
    return this.support.sendAdminMessage(adminId, id, dto);
  }

  @Patch('conversations/:id/assign')
  @ApiOperation({ summary: 'Assign support conversation to an admin' })
  assign(
    @CurrentUser('userId') adminId: string,
    @Param('id') id: string,
    @Body() dto: AssignSupportConversationDto,
  ) {
    return this.support.assignConversation(id, dto, adminId);
  }

  @Patch('conversations/:id/close')
  @ApiOperation({ summary: 'Close support conversation' })
  close(@Param('id') id: string) {
    return this.support.closeConversation(id);
  }

  @Post('conversations/:id/summarize')
  @ApiOperation({ summary: 'Generate or refresh a support conversation memory summary' })
  summarize(@Param('id') id: string) {
    return this.support.summarizeConversation(id);
  }

  @Get('conversations/:id/summary')
  @ApiOperation({ summary: 'Get support conversation memory summary' })
  summary(@Param('id') id: string) {
    return this.support.getConversationSummary(id);
  }

  @Get('knowledge')
  @ApiOperation({ summary: 'List support AI knowledge items' })
  knowledge(@Query('includeDisabled') includeDisabled?: string) {
    return this.support.listKnowledgeItems(includeDisabled === '1' || includeDisabled === 'true');
  }

  @Post('knowledge/seed-defaults')
  @ApiOperation({ summary: 'Seed or refresh default support AI knowledge items' })
  seedDefaultKnowledge(@CurrentUser('userId') adminId: string) {
    return this.support.seedDefaultKnowledge(adminId);
  }

  @Post('knowledge')
  @ApiOperation({ summary: 'Create support AI knowledge item' })
  createKnowledge(
    @CurrentUser('userId') adminId: string,
    @Body() dto: UpsertSupportKnowledgeDto,
  ) {
    return this.support.createKnowledgeItem(adminId, dto);
  }

  @Patch('knowledge/:id')
  @ApiOperation({ summary: 'Update support AI knowledge item' })
  updateKnowledge(
    @Param('id') id: string,
    @Body() dto: UpsertSupportKnowledgeDto,
  ) {
    return this.support.updateKnowledgeItem(id, dto);
  }

  @Patch('knowledge/:id/enabled')
  @ApiOperation({ summary: 'Enable or disable support AI knowledge item' })
  toggleKnowledge(@Param('id') id: string, @Body('enabled') enabled: boolean) {
    return this.support.toggleKnowledgeItem(id, Boolean(enabled));
  }
}
