import {
  IsString, IsEnum, IsOptional, IsInt, IsUrl,
  IsArray, MaxLength, MinLength, Min, Max, ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AiPlatform {
  CHATGPT = 'chatgpt',
  CLAUDE = 'claude',
  PERPLEXITY = 'perplexity',
  GEMINI = 'gemini',
  COPILOT = 'copilot',
  OTHER = 'other',
}

export class CreateSuccessCaseDto {
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(100)
  title: string;

  @ApiProperty({ enum: AiPlatform }) @IsEnum(AiPlatform)
  aiPlatform: AiPlatform;

  @ApiProperty() @IsString() @MinLength(5) @MaxLength(200)
  queryUsed: string;

  @ApiProperty() @IsString() @MinLength(20) @MaxLength(2000)
  aiResponse: string;

  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(2048)
  screenshotUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100)
  beforeGeoScore?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100)
  afterGeoScore?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(365)
  improvementDays?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128)
  siteId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80)
  industry?: string;

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(40, { each: true }) @ArrayMaxSize(10)
  tags?: string[];
}
