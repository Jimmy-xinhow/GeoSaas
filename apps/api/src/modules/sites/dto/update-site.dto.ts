import { PartialType } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateSiteDto } from './create-site.dto';

export class UpdateSiteDto extends PartialType(CreateSiteDto) {
  @ApiPropertyOptional({
    description: 'Site business profile (industry, services, targetAudience, etc.)',
    example: {
      industry: '電子商務',
      description: '提供手工皮革製品的線上商店',
      services: '客製化皮件、皮革保養、維修服務',
      targetAudience: '25-45歲注重品質的消費者',
      location: '台北市',
      keywords: ['手工皮件', '客製化'],
      uniqueValue: '20年職人手工打造',
      contactInfo: 'service@example.com',
    },
  })
  @IsObject()
  @IsOptional()
  profile?: Record<string, any>;
}
