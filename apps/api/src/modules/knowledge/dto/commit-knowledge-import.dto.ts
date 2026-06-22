import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CommitKnowledgeImportItemDto {
  @ApiProperty({ example: 'What problem does this product solve?' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  question: string;

  @ApiProperty({ example: 'It helps customers understand...' })
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  answer: string;

  @ApiPropertyOptional({ example: 'product' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}

export class CommitKnowledgeImportDto {
  @ApiProperty({ type: [CommitKnowledgeImportItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CommitKnowledgeImportItemDto)
  items: CommitKnowledgeImportItemDto[];
}
