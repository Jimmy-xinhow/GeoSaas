import { Transform } from 'class-transformer';
import { IsIn, IsString } from 'class-validator';

export class CreateCheckoutDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsIn(['STARTER', 'PRO'])
  plan: string;
}
