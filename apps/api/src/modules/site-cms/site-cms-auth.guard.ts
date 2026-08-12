import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SiteCmsService } from './site-cms.service';

@Injectable()
export class SiteCmsAuthGuard implements CanActivate {
  constructor(private readonly service: SiteCmsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = String(request.headers.authorization || '');
    const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) throw new UnauthorizedException('請先登入文章後台。');
    request.siteCms = await this.service.authenticateToken(String(request.params.siteId || ''), match[1]);
    return true;
  }
}
