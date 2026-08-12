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

interface SiteCmsImageUpload {
  accountId: string;
  siteId: string;
  file: {
    buffer: Buffer;
    mimetype: string;
    size: number;
  };
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
    // Optional — set for S3-compatible providers (Cloudflare R2, Backblaze B2,
    // Wasabi, DigitalOcean Spaces, MinIO). Leave empty to target AWS S3.
    const endpoint = this.config.get<string>('AWS_S3_ENDPOINT') || undefined;
    const forcePathStyle =
      this.config.get<string>('AWS_S3_FORCE_PATH_STYLE') === 'true';

    if (region && bucket && accessKeyId && secretAccessKey) {
      this.s3 = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
        endpoint,
        forcePathStyle,
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

  private detectImageMime(buffer: Buffer): string | null {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return 'image/png';
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    const signature = buffer.subarray(0, 6).toString('ascii');
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif';
    if (
      buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }
    return null;
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

  async uploadSiteCmsImage(req: SiteCmsImageUpload): Promise<{ publicUrl: string; key: string }> {
    if (!this.s3) {
      throw new ServiceUnavailableException('檔案上傳尚未設定，請聯絡系統管理員。');
    }
    if (!req.file?.buffer || req.file.size <= 0 || req.file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('檔案大小需介於 1 byte 至 5 MB');
    }
    if (!ALLOWED_MIME.has(req.file.mimetype)) {
      throw new BadRequestException('僅支援 PNG、JPEG、WebP 或 GIF 圖片');
    }
    const detectedMime = this.detectImageMime(req.file.buffer);
    if (!detectedMime || detectedMime !== req.file.mimetype) {
      throw new BadRequestException('圖片內容與檔案格式不符');
    }

    const safeSiteId = req.siteId.replace(/[^A-Za-z0-9_-]/g, '');
    const safeAccountId = req.accountId.replace(/[^A-Za-z0-9_-]/g, '');
    const datePart = new Date().toISOString().slice(0, 10);
    const ext = this.extFromContentType(detectedMime);
    const key = `site-cms/${safeSiteId}/${datePart}/${safeAccountId}-${randomBytes(12).toString('hex')}.${ext}`;
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: detectedMime,
      ContentLength: req.file.size,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return {
      publicUrl: `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`,
      key,
    };
  }
}
