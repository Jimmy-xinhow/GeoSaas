import { IsArray, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AiGenerateQaDto {
  @ApiPropertyOptional({
    description: 'Questions to exclude from generation (avoid duplicates)',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  excludeQuestions?: string[];
}
