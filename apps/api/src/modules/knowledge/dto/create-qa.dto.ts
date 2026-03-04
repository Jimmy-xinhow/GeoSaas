import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateQaDto {
  @ApiProperty({ example: '你們的服務如何收費？' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  question: string;

  @ApiProperty({ example: '我們提供免費方案和 Pro 方案，Pro 方案每月 NT$990...' })
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  answer: string;

  @ApiPropertyOptional({ example: 'brand', description: '問答分類 (brand, industry, product, consumer, education)' })
  @IsString()
  @IsOptional()
  category?: string;
}
