import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateJsonLdDto {
  @ApiProperty({ example: 'Organization', description: 'Schema.org type (e.g. Organization, LocalBusiness, Product)' })
  @IsString()
  type: string;

  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'https://acme.com' })
  @IsString()
  url: string;

  @ApiProperty({ example: 'Leading provider of innovative solutions', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'https://acme.com/logo.png', required: false })
  @IsString()
  @IsOptional()
  logo?: string;

  @ApiProperty({ example: 'info@acme.com', required: false })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: '+1-555-0100', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: '123 Main St, Springfield', required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ example: '$$', required: false, description: 'Price range for LocalBusiness type' })
  @IsString()
  @IsOptional()
  priceRange?: string;

  @ApiProperty({ required: false, description: 'Opening hours for LocalBusiness type' })
  @IsOptional()
  openingHours?: any;
}
