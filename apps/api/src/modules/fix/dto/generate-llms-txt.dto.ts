import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class LlmsTxtLinkDto {
  @ApiProperty({ example: 'About Us' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'https://acme.com/about' })
  @IsString()
  url: string;
}

export class GenerateLlmsTxtDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Leading provider of innovative solutions for modern businesses.' })
  @IsString()
  description: string;

  @ApiProperty({ example: 'https://acme.com' })
  @IsString()
  url: string;

  @ApiProperty({
    type: [LlmsTxtLinkDto],
    required: false,
    description: 'Important page links to include in llms.txt',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LlmsTxtLinkDto)
  @IsOptional()
  links?: LlmsTxtLinkDto[];
}
