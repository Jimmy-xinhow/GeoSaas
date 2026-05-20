import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class TrackAffiliateClickDto {
  @IsString()
  @MinLength(4)
  @MaxLength(40)
  affiliateCode: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  visitorId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  landingPage?: string;
}

export class ApplyAffiliateDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  realName: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(300)
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promotionChannel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  audienceDescription?: string;

  @IsOptional()
  @IsIn(['bank_transfer', 'platform_credits'])
  payoutMethod?: 'bank_transfer' | 'platform_credits';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankBranch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankAccountName?: string;
}

export class RequestWithdrawalDto {
  @IsInt()
  @Min(1000)
  @Max(1000000)
  amount: number;

  @IsIn(['bank_transfer', 'platform_credits'])
  type: 'bank_transfer' | 'platform_credits';
}

export class ReviewAffiliateDto {
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;
}

export class UpdateAffiliateTierDto {
  @IsIn(['standard', 'gold', 'platinum'])
  tier: 'standard' | 'gold' | 'platinum';
}

export class ProcessWithdrawalDto {
  @IsIn(['completed', 'rejected'])
  decision: 'completed' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;
}

export class AffiliateTierRatesDto {
  @IsInt()
  @Min(0)
  @Max(100)
  standard: number;

  @IsInt()
  @Min(0)
  @Max(100)
  gold: number;

  @IsInt()
  @Min(0)
  @Max(100)
  platinum: number;
}

export class UpdateAffiliateSettingsDto {
  @IsBoolean()
  applicationEnabled: boolean;

  @IsBoolean()
  autoApproveApplications: boolean;

  @ValidateNested()
  @Type(() => AffiliateTierRatesDto)
  tierRates: AffiliateTierRatesDto;

  @IsInt()
  @Min(1)
  @Max(365)
  cookieWindowDays: number;

  @IsInt()
  @Min(100)
  @Max(1000000)
  minWithdrawalAmount: number;

  @IsInt()
  @Min(0)
  @Max(180)
  commissionLockDays: number;

  @IsBoolean()
  allowBankTransfer: boolean;

  @IsBoolean()
  allowPlatformCredits: boolean;

  @IsInt()
  @Min(0)
  @Max(10000000)
  annualTaxThreshold: number;

  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  programTerms: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  landingPageIntro: string;

  @IsOptional()
  @IsBoolean()
  applyTierRatesToExisting?: boolean;
}
