import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateSupportConversationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  subject: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsString()
  siteId?: string;
}

export class SendSupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}

export class QuerySupportConversationsDto {
  @IsOptional()
  @IsIn(['open', 'waiting_admin', 'waiting_user', 'closed'])
  status?: string;

  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: string;
}

export class AssignSupportConversationDto {
  @IsOptional()
  @IsString()
  adminId?: string;
}

export class UpsertSupportKnowledgeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  question?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  answer: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;
}
