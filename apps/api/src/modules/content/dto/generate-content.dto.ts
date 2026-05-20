import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateContentDto {
  @ApiProperty({ enum: ['FAQ', 'ARTICLE'] })
  @IsEnum(['FAQ', 'ARTICLE'])
  type: 'FAQ' | 'ARTICLE';

  @ApiProperty({
    example: 'clx_site_id',
    description: 'The owned site whose brand profile and knowledge base should ground the generated content.',
  })
  @IsString()
  siteId: string;

  @ApiProperty({
    example: ['GEO 優化', 'AI 搜尋能見度'],
    type: [String],
    required: false,
    description: 'Optional content focus. Brand facts are loaded from the selected site knowledge base.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(8)
  @MaxLength(80, { each: true })
  keywords?: string[];

  @ApiProperty({ example: 'zh-TW', required: false })
  @IsString()
  @IsOptional()
  language?: string;
}
