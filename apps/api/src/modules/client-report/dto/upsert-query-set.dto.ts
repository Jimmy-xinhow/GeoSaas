import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ClientReportQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  category: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  question: string;
}

export class UpsertQuerySetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  siteId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ClientReportQueryDto)
  queries: ClientReportQueryDto[];
}
