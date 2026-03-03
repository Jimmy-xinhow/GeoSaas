import { IsString, IsEnum, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateContentDto {
  @ApiProperty({ enum: ['FAQ', 'ARTICLE'] })
  @IsEnum(['FAQ', 'ARTICLE'])
  type: 'FAQ' | 'ARTICLE';

  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  brandName: string;

  @ApiProperty({ example: '電子商務', required: false })
  @IsString()
  @IsOptional()
  industry?: string;

  @ApiProperty({ example: ['GEO 優化', 'AI 搜尋'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  keywords: string[];

  @ApiProperty({ example: 'zh-TW', required: false })
  @IsString()
  @IsOptional()
  language?: string;
}
