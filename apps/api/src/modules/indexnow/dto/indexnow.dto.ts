import { IsUrl, IsArray, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitUrlDto {
  @ApiProperty({ example: 'https://example.com' })
  @IsUrl()
  url: string;
}

export class SubmitBatchDto {
  @ApiProperty({ example: ['https://example.com', 'https://example.com/about'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUrl({}, { each: true })
  urls: string[];
}
