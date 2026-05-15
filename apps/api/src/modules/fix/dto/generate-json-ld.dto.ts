import { IsEmail, IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateJsonLdDto {
  @ApiProperty({ example: 'Organization', description: 'Schema.org type (e.g. Organization, LocalBusiness, Product)' })
  @IsIn(['Organization', 'LocalBusiness', 'Product', 'WebSite', 'Article', 'FAQPage'])
  @IsString()
  type: string;

  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'https://acme.com' })
  @IsUrl({ require_protocol: true })
  url: string;

  @ApiProperty({ example: 'Leading provider of innovative solutions', required: false })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'https://acme.com/logo.png', required: false })
  @IsUrl({ require_protocol: true })
  @IsOptional()
  logo?: string;

  @ApiProperty({ example: 'info@acme.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: '+1-555-0100', required: false })
  @IsString()
  @MaxLength(40)
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: '123 Main St, Springfield', required: false })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  address?: string;

  @ApiProperty({ example: '$$', required: false, description: 'Price range for LocalBusiness type' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  priceRange?: string;

  @ApiProperty({ required: false, description: 'Opening hours for LocalBusiness type' })
  @IsOptional()
  openingHours?: any;
}
