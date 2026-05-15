import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ImportSeedCsvDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @Matches(/^[A-Za-z0-9._-]+\.csv$/i, { each: true })
  files?: string[];
}
