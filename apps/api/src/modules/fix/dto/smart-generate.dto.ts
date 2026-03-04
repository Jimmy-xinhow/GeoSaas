import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SmartGenerateDto {
  @ApiProperty({ description: 'Site ID to generate fix for' })
  @IsString()
  siteId: string;

  @ApiProperty({
    description: 'Indicator name (json_ld, og_tags, llms_txt, faq_schema)',
    example: 'json_ld',
  })
  @IsString()
  indicator: string;

  @ApiProperty({ description: 'Scan Result ID to save the generated code to' })
  @IsString()
  scanResultId: string;
}
