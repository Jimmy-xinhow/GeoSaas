import { IsString, MinLength, MaxLength } from 'class-validator';

export class RejectSuccessCaseDto {
  @IsString()
  @MinLength(2, { message: '拒絕原因至少需要 2 個字' })
  @MaxLength(500)
  reason: string;
}
