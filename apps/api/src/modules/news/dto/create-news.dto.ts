import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateNewsDto {
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  titleEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  titleJa?: string;

  @IsString()
  @MinLength(20)
  @MaxLength(3000)
  summary: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  summaryEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  summaryJa?: string;

  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  sourceUrl: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  sourceName: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  imageUrl?: string;
}
