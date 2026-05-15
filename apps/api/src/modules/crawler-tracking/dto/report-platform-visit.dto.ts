import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AI_BOT_NAMES } from './report-visit.dto';

export class ReportPlatformVisitDto {
  @ApiProperty()
  @IsString()
  @IsIn(AI_BOT_NAMES)
  botName: string;

  @ApiProperty()
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  url: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  userAgent: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  statusCode: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;
}
