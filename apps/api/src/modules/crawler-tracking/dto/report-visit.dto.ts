import { Type } from 'class-transformer';
import { IsString, IsOptional, IsInt, IsIn, IsUrl, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AI_BOTS } from '@geovault/shared';

export const AI_BOT_NAMES = AI_BOTS.map((bot) => bot.name);

export class ReportVisitDto {
  @ApiProperty()
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  token: string;

  @ApiProperty()
  @IsString()
  @IsIn(AI_BOT_NAMES)
  botName: string;

  @ApiProperty()
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  statusCode?: number;
}
