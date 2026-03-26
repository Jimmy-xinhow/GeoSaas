import { Controller, Post, Get, Param, Body, Ip } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { GuestScanService } from './guest-scan.service';
import { CreateGuestScanDto } from './dto/create-guest-scan.dto';

@ApiTags('Guest Scan')
@Controller('guest-scan')
export class GuestScanController {
  constructor(private readonly service: GuestScanService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Trigger a free guest scan (rate-limited by IP)' })
  create(@Body() dto: CreateGuestScanDto, @Ip() ip: string) {
    return this.service.createScan(dto.url, ip);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get guest scan status & results' })
  getStatus(@Param('id') id: string) {
    return this.service.getStatus(id);
  }
}
