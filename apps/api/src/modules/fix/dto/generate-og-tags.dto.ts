import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateOgTagsDto {
  @ApiProperty({ example: 'Acme Corp - Innovative Solutions' })
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'Leading provider of innovative solutions for modern businesses.' })
  @IsString()
  @MaxLength(300)
  description: string;

  @ApiProperty({ example: 'https://acme.com' })
  @IsUrl({ require_protocol: true })
  url: string;

  @ApiProperty({ example: 'https://acme.com/og-image.jpg', required: false })
  @IsUrl({ require_protocol: true })
  @IsOptional()
  image?: string;

  @ApiProperty({ example: 'website', required: false, description: 'OG type (website, article, product, etc.)' })
  @IsIn(['website', 'article', 'product', 'profile'])
  @IsString()
  @IsOptional()
  type?: string;
}
