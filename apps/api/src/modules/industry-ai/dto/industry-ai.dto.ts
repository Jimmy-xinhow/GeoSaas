import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
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
