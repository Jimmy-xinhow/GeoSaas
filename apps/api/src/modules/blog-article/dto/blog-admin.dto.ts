import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const INSIGHT_TYPES = [
  'industry_current_state',
  'missing_indicator_focus',
  'top_brands_analysis',
  'improvement_opportunity',
] as const;

export class PreviewBrandShowcaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  services?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  contact?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  forbidden?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  positioning?: string;
}

export class GenerateInsightDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  industry: string;

  @IsOptional()
  @IsIn(INSIGHT_TYPES)
  type?: (typeof INSIGHT_TYPES)[number];
}
