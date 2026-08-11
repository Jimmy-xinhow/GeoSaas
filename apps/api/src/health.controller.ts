import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { EmailService } from './modules/email/email.service';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly email: EmailService,
    private readonly health: HealthService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  check() {
    return this.health.liveness();
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Process liveness check' })
  live() {
    return this.health.liveness();
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Database and Redis readiness check' })
  async ready() {
    const readiness = await this.health.readiness();
    if (readiness.status !== 'ok') {
      throw new ServiceUnavailableException(readiness);
    }
    return readiness;
  }

  @Public()
  @Get('email')
  @ApiOperation({ summary: 'Email provider configuration health check' })
  emailStatus() {
    return this.email.getStatus();
  }
}
