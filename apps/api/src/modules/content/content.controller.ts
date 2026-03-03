import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { GenerateContentDto } from './dto/generate-content.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Content')
@ApiBearerAuth()
@Controller('contents')
export class ContentController {
  constructor(private contentService: ContentService) {}

  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    return this.contentService.findAll(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.contentService.findOne(id, userId);
  }

  @Post('generate')
  generate(@Body() dto: GenerateContentDto, @CurrentUser('userId') userId: string) {
    return this.contentService.generate(dto, userId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: { title?: string; body?: string }, @CurrentUser('userId') userId: string) {
    return this.contentService.update(id, data, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.contentService.remove(id, userId);
  }
}
