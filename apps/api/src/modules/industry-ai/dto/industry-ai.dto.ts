import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  MinLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RunIndustryComparisonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  siteAId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  siteBId: string;
}

export class SeedIndustryQueryItemDto {
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  question: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  category: string;
}

export class SeedIndustryQueriesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  industry: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SeedIndustryQueryItemDto)
  queries: SeedIndustryQueryItemDto[];
}

const INDUSTRY_AI_PLATFORM_VALUES = ['CHATGPT', 'CLAUDE', 'PERPLEXITY', 'GEMINI', 'COPILOT'] as const;

export class RunIndustryTestDto {
  @IsOptional()
  @IsBoolean()
  fullRun?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxSites?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxQueries?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsIn(INDUSTRY_AI_PLATFORM_VALUES, { each: true })
  platforms?: Array<(typeof INDUSTRY_AI_PLATFORM_VALUES)[number]>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxTotalCalls?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  maxCopilotCalls?: number;
}
