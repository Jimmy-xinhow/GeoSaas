import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateLlmsTxtDto {
  @ApiProperty({ description: 'llms.txt content' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
