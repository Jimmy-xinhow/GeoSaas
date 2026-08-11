import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  buildBlogArticleContentKey,
  hasBlogArticleIdentityChange,
  normalizeBlogArticleDescription,
  normalizeBlogArticleTitle,
  resolveBlogArticleIntent,
} from '../modules/blog-article/blog-article-normalization';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
    this.$use(async (params, next) => {
      if (params.model !== 'BlogArticle') return next(params);

      const findDuplicate = async (contentKey: string) => {
        const query: Record<string, any> = { where: { contentKey } };
        if (params.args?.select) query.select = params.args.select;
        if (params.args?.include) query.include = params.args.include;
        return this.blogArticle.findUnique(query as any);
      };

      const normalizeData = (data: Record<string, any>, base: Record<string, any> = {}) => {
        if (typeof data.description === 'string') {
          data.description = normalizeBlogArticleDescription(data.description);
        }
        const identityChanged = hasBlogArticleIdentityChange(data);
        // Description, publication state, and retirement updates must not
        // opportunistically assign a contentKey. Historical duplicates are
        // consolidated explicitly before their canonical identity is stored.
        if (!identityChanged) return;
        const identity = { ...base, ...data };
        data.normalizedTitle = normalizeBlogArticleTitle(identity.title);
        data.contentIntent = resolveBlogArticleIntent(identity);
        data.contentKey = buildBlogArticleContentKey(identity);
      };

      if (params.action === 'create') {
        normalizeData(params.args.data);
        if (params.args.data.contentKey) {
          const duplicate = await findDuplicate(params.args.data.contentKey);
          if (duplicate) {
            this.logger.warn(`Prevented duplicate BlogArticle create: ${duplicate.id}`);
            return duplicate;
          }
        }
      } else if (params.action === 'createMany') {
        const rows = Array.isArray(params.args.data) ? params.args.data : [params.args.data];
        rows.forEach((row: Record<string, any>) => normalizeData(row));
        const seen = new Set<string>();
        params.args.data = rows.filter((row: Record<string, any>) => {
          if (!row.contentKey || !seen.has(row.contentKey)) {
            if (row.contentKey) seen.add(row.contentKey);
            return true;
          }
          return false;
        });
        params.args.skipDuplicates = true;
      } else if (params.action === 'update') {
        const existing = await this.blogArticle.findUnique({
          where: params.args.where,
          select: { siteId: true, title: true, templateType: true, category: true, contentIntent: true },
        });
        normalizeData(params.args.data, existing || {});
      } else if (params.action === 'updateMany') {
        normalizeData(params.args.data);
      } else if (params.action === 'upsert') {
        normalizeData(params.args.create);
        const existing = await this.blogArticle.findUnique({
          where: params.args.where,
          select: { siteId: true, title: true, templateType: true, category: true, contentIntent: true },
        });
        normalizeData(params.args.update, existing || params.args.create);
      }

      try {
        return await next(params);
      } catch (error) {
        if (
          (params.action === 'create' || params.action === 'upsert')
          && error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === 'P2002'
        ) {
          const contentKey = params.action === 'create'
            ? params.args.data.contentKey
            : params.args.create.contentKey;
          if (contentKey) {
            const duplicate = await findDuplicate(contentKey);
            if (duplicate) return duplicate;
          }
        }
        throw error;
      }
    });
  }

  async onModuleInit() {
    if (process.env.LOCAL_OFFLINE_MODE === '1') {
      this.logger.warn('LOCAL_OFFLINE_MODE=1: skipping Prisma database connection');
      return;
    }
    await this.$connect();
    await this.ensureAdminUser();
  }

  async onModuleDestroy() {
    if (process.env.LOCAL_OFFLINE_MODE === '1') return;
    await this.$disconnect();
  }

  /** Ensure default admin account exists on every startup */
  private async ensureAdminUser() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return; // Skip if not configured

    try {
      const existing = await this.user.findUnique({ where: { email } });
      if (!existing) {
        const passwordHash = await bcrypt.hash(password, 10);
        await this.user.create({
          data: {
            email,
            name: 'Admin',
            passwordHash,
            emailVerified: true,
            role: 'SUPER_ADMIN',
            plan: 'PRO',
          },
        });
        this.logger.log(`Admin user created: ${email}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to ensure admin user: ${err}`);
    }
  }
}
