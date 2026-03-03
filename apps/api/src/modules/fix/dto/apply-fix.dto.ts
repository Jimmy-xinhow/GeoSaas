import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApplyFixDto {
  @ApiProperty({ example: '<script type="application/ld+json">...</script>', description: 'The generated code to store in the scan result' })
  @IsString()
  generatedCode: string;
}
