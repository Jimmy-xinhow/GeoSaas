import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) =>
  (target: any, key?: string, descriptor?: any) => {
    Reflect.defineMetadata(ROLES_KEY, roles, descriptor?.value ?? target);
    return descriptor ?? target;
  };

// Role hierarchy: SUPER_ADMIN > ADMIN > STAFF > USER
const ROLE_HIERARCHY: Record<string, number> = {
  USER: 0,
  STAFF: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user?.role) return false;

    // SUPER_ADMIN can do everything ADMIN can
    if (user.role === 'SUPER_ADMIN' && requiredRoles.includes('ADMIN')) {
      return true;
    }

    return requiredRoles.includes(user.role);
  }
}
