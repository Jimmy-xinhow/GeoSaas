import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class GenerateOfficialArticleDto {
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  topic!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  angle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceArticleId?: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  canonicalUrl!: string;
}
