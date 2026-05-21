import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { EmailService } from './modules/email/email.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly email: EmailService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  @Public()
  @Get('email')
  @ApiOperation({ summary: 'Email provider configuration health check' })
  emailStatus() {
    return this.email.getStatus();
  }
}
