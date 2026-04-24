import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UploadService } from './upload.service';
import { PresignScreenshotDto } from './dto/presign-screenshot.dto';

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly service: UploadService) {}

  @ApiBearerAuth()
  @Get('config')
  @ApiOperation({ summary: 'Check whether upload backend is configured' })
  config() {
    return { configured: this.service.isConfigured() };
  }

  @ApiBearerAuth()
  @Post('case-screenshot/presign')
  @ApiOperation({ summary: 'Get a presigned PUT URL for uploading a case screenshot' })
  presignScreenshot(
    @CurrentUser('userId') userId: string,
    @Body() dto: PresignScreenshotDto,
  ) {
    return this.service.createPresign({
      userId,
      fileName: dto.fileName,
      contentType: dto.contentType,
      fileSize: dto.fileSize,
      kind: 'case-screenshot',
    });
  }
}
