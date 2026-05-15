import { Type } from 'class-transformer';
import { IsIn, IsInt } from 'class-validator';

export class CreateCreditCheckoutDto {
  @Type(() => Number)
  @IsInt()
  @IsIn([50, 100, 200])
  points: number;
}
