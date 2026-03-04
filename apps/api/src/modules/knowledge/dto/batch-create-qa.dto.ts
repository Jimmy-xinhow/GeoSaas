import { Type } from 'class-transformer';
import { ValidateNested, ArrayMaxSize, ArrayMinSize, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateQaDto } from './create-qa.dto';

export class BatchCreateQaDto {
  @ApiProperty({ type: [CreateQaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQaDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  items: CreateQaDto[];
}
