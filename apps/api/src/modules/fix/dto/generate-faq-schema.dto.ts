import { IsString, IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class FaqItemDto {
  @ApiProperty({ example: 'What is GEO optimization?' })
  @IsString()
  question: string;

  @ApiProperty({ example: 'GEO (Generative Engine Optimization) is the practice of optimizing your website to be better understood by AI-powered search engines.' })
  @IsString()
  answer: string;
}

export class GenerateFaqSchemaDto {
  @ApiProperty({
    type: [FaqItemDto],
    description: 'Array of FAQ question-answer pairs',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FaqItemDto)
  faqs: FaqItemDto[];
}
