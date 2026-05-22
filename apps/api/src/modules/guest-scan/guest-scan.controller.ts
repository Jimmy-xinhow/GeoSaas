import { Controller, Post, Get, Param, Body, Ip, GoneException } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Deprecated: free scans now require registration' })
  create(@Body() dto: CreateGuestScanDto, @Ip() ip: string) {
    void dto;
    void ip;
    throw new GoneException('免費掃描已改為註冊後啟動。請先建立免費帳號。');
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get guest scan status & results' })
  getStatus(@Param('id') id: string) {
    return this.service.getStatus(id);
  }
}
