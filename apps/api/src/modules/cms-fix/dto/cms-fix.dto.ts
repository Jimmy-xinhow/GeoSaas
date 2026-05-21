import { IsArray, IsObject, IsOptional, IsString, IsUrl } from 'class-validator';

export class ConnectWordPressDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  apiBaseUrl?: string;
}

export class PluginPingDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];
}

export class PluginActionResultDto {
  @IsString()
  status: 'applied' | 'failed' | 'skipped';

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
