import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateOgTagsDto {
  @ApiProperty({ example: 'Acme Corp - Innovative Solutions' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Leading provider of innovative solutions for modern businesses.' })
  @IsString()
  description: string;

  @ApiProperty({ example: 'https://acme.com' })
  @IsString()
  url: string;

  @ApiProperty({ example: 'https://acme.com/og-image.jpg', required: false })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiProperty({ example: 'website', required: false, description: 'OG type (website, article, product, etc.)' })
  @IsString()
  @IsOptional()
  type?: string;
}
