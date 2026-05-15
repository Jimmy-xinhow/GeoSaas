import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class LlmsTxtLinkDto {
  @ApiProperty({ example: 'About Us' })
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'https://acme.com/about' })
  @IsUrl({ require_protocol: true })
  url: string;
}

export class GenerateLlmsTxtDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'Leading provider of innovative solutions for modern businesses.' })
  @IsString()
  @MaxLength(500)
  description: string;

  @ApiProperty({ example: 'https://acme.com' })
  @IsUrl({ require_protocol: true })
  url: string;

  @ApiProperty({
    type: [LlmsTxtLinkDto],
    required: false,
    description: 'Important page links to include in llms.txt',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => LlmsTxtLinkDto)
  @IsOptional()
  links?: LlmsTxtLinkDto[];
}
