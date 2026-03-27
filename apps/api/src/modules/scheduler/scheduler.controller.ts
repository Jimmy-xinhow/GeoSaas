import { Controller, Get, Patch, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { CronManagerService } from './cron-manager.service';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import cronParser from 'cron-parser';

@ApiTags('Admin — Scheduler')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('admin/scheduler')
export class SchedulerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cronManager: CronManagerService,
  ) {}

  @Get('tasks')
  @ApiOperation({ summary: 'List all scheduled tasks with status' })
  async listTasks() {
    return this.prisma.scheduledTask.findMany({
      orderBy: { taskKey: 'asc' },
    });
  }

  @Patch('tasks/:taskKey')
  @ApiOperation({ summary: 'Update a scheduled task (cron, enabled, etc.)' })
  async updateTask(
    @Param('taskKey') taskKey: string,
    @Body() body: { cronExpr?: string; enabled?: boolean; name?: string; description?: string },
  ) {
    const data: any = {};

    if (body.cronExpr !== undefined) {
      // Validate cron expression
      try {
        cronParser.parseExpression(body.cronExpr);
      } catch {
        return { error: 'Invalid cron expression' };
      }
      data.cronExpr = body.cronExpr;
      data.nextRunAt = cronParser.parseExpression(body.cronExpr).next().toDate();
    }
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;

    return this.prisma.scheduledTask.update({
      where: { taskKey },
      data,
    });
  }

  @Post('tasks/:taskKey/run')
  @ApiOperation({ summary: 'Manually trigger a task immediately' })
  async runTask(@Param('taskKey') taskKey: string) {
    // Trigger via CronManager
    this.cronManager.checkAndRunTasks().catch(() => {});
    return { message: `Task ${taskKey} triggered` };
  }
}
