import { ApiProperty } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';

export class CreateGuestScanDto {
  @ApiProperty({ example: 'https://example.com' })
  @IsUrl()
  url: string;
}
