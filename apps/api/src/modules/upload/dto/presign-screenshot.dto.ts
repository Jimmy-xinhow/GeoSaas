import { IsString, IsInt, Min, Max, MaxLength } from 'class-validator';

export class PresignScreenshotDto {
  @IsString()
  @MaxLength(200)
  fileName: string;

  @IsString()
  @MaxLength(80)
  contentType: string;

  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  fileSize: number;
}
