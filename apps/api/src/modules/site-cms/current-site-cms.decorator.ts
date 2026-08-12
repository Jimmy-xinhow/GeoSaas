import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SiteCmsContext } from './site-cms.types';

export const CurrentSiteCms = createParamDecorator(
  (field: keyof SiteCmsContext | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    const current = request.siteCms as SiteCmsContext | undefined;
    return field ? current?.[field] : current;
  },
);

