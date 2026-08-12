import { Type, Transform } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const SITE_CMS_CATEGORIES = [
  'washing',
  'decontamination',
  'paint-care',
  'coating',
  'interior',
  'product-guide',
  'brand-news',
] as const;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SiteCmsLoginDto {
  @Transform(lower)
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{2,31}$/)
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class SiteCmsChangePasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'newPassword must include upper-case, lower-case, number, and symbol',
  })
  newPassword!: string;
}

export class SiteCmsFaqDto {
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(160)
  question!: string;

  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  answer!: string;
}

export class SiteCmsSourceDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label!: string;

  @Transform(trim)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  url!: string;
}

export class CreateSiteCmsArticleDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(70)
  title!: string;

  @Transform(lower)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(100)
  slug!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60000)
  content?: string;

  @IsOptional()
  @IsIn(SITE_CMS_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ArrayUnique()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  coverImageUrl?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  coverAlt?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  author?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  reviewedBy?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  keyTakeaways?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => SiteCmsFaqDto)
  faq?: SiteCmsFaqDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SiteCmsSourceDto)
  sources?: SiteCmsSourceDto[];

  @IsOptional()
  @IsBoolean()
  featured?: boolean;
}

export class UpdateSiteCmsArticleDto extends PartialType(CreateSiteCmsArticleDto) {
  @IsInt()
  @Min(1)
  version!: number;
}

export class SiteCmsArticleVersionDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class SiteCmsArticleQueryDto {
  @IsOptional()
  @IsIn(['draft', 'published', 'archived'])
  status?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
