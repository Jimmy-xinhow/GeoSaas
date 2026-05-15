import { IsBoolean } from 'class-validator';

export class VerifySiteDto {
  @IsBoolean()
  isVerified: boolean;
}
