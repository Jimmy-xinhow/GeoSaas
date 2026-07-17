import { IsUrl, MaxLength } from 'class-validator';

export class VerifyOfficialArticleDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url!: string;
}
