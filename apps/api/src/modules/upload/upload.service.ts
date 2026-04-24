import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';

interface PresignRequest {
  userId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  kind: 'case-screenshot';
}

export interface PresignResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresInSeconds: number;
}

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const PRESIGN_TTL_SECONDS = 300;

@Injectable()
export class UploadService {
  private s3: S3Client | null = null;
  private bucket = '';
  private region = '';
  private publicBaseUrl = '';

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('AWS_REGION');
    const bucket = this.config.get<string>('AWS_S3_BUCKET');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');

    if (region && bucket && accessKeyId && secretAccessKey) {
      this.s3 = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.bucket = bucket;
      this.region = region;
      this.publicBaseUrl =
        this.config.get<string>('AWS_S3_PUBLIC_BASE_URL') ||
        `https://${bucket}.s3.${region}.amazonaws.com`;
    }
  }

  isConfigured(): boolean {
    return this.s3 !== null;
  }

  private extFromContentType(contentType: string): string {
    return {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
    }[contentType] ?? 'bin';
  }

  async createPresign(req: PresignRequest): Promise<PresignResult> {
    if (!this.s3) {
      throw new ServiceUnavailableException(
        '檔案上傳尚未設定。請聯絡管理員完成 AWS S3 配置（AWS_REGION / AWS_S3_BUCKET / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY）。',
      );
    }
    if (!ALLOWED_MIME.has(req.contentType)) {
      throw new BadRequestException(
        `僅支援 PNG / JPEG / WebP / GIF 格式（收到 ${req.contentType}）`,
      );
    }
    if (req.fileSize <= 0 || req.fileSize > MAX_SIZE_BYTES) {
      throw new BadRequestException('檔案大小需介於 1 byte 至 5 MB');
    }

    const datePart = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const random = randomBytes(6).toString('hex');
    const ext = this.extFromContentType(req.contentType);
    const key = `${req.kind}/${datePart}/${req.userId}-${random}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: req.contentType,
      ContentLength: req.fileSize,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: PRESIGN_TTL_SECONDS,
    });

    return {
      uploadUrl,
      publicUrl: `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`,
      key,
      expiresInSeconds: PRESIGN_TTL_SECONDS,
    };
  }
}
