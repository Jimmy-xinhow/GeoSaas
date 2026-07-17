import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GenerateOfficialArticleDto {
  /**
   * Optional on purpose: the recommendation endpoint and the generation
   * service can derive this from the customer's Brand Facts and Q&A.
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  topic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  angle?: string;

  /** Optional direction from the customer; the system validates and refines it against first-party data. */
  @IsOptional()
  @IsString()
  @MaxLength(240)
  topicDirection?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceArticleId?: string;

  /** The customer's CMS collection URL, for example https://brand.com/blog. */
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  publishBaseUrl?: string;

  /** Optional ASCII override. When omitted the service uses its suggested slug. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/i, {
    message: 'slug 只能包含英文字母、數字與連字號',
  })
  @MaxLength(100)
  slug?: string;

  /**
   * Kept for clients using the previous contract. New clients should send
   * publishBaseUrl + slug (or omit both and accept the recommendation).
   */
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  canonicalUrl?: string;
}
