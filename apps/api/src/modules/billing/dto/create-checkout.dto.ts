import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCheckoutDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsIn(['STARTER', 'PRO'])
  plan: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @IsIn(['monthly', 'yearly'])
  billingCycle?: 'monthly' | 'yearly';
}

export class CreateManagedCheckoutDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsIn(['MANAGED_BASIC', 'MANAGED_PRO'])
  plan: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @IsIn(['monthly', 'yearly'])
  billingCycle?: 'monthly' | 'yearly';

  @IsBoolean()
  acceptedTerms: boolean;

  @IsString()
  @IsIn(['managed-service-2026-05-19'])
  termsVersion: string;
}

export class ManagedRefundRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  orderNo: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsIn(['MANAGED_BASIC', 'MANAGED_PRO'])
  plan: string;

  @IsString()
  @IsIn(['refund', 'extension'])
  requestedResolution: string;

  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  basis: string;

  @IsBoolean()
  acceptedReviewTerms: boolean;
}

export class CancelSubscriptionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  orderNo: string;

  @IsBoolean()
  acceptedTerminationNotice: boolean;
}
