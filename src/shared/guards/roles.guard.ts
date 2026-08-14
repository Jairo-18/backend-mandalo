import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RoleTypeCode } from '../roles/roleTypeCode.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleTypeCode[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    const roleCode = user?.roleType?.code;

    if (!roleCode) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta acción',
      );
    }

    // SUPERADMIN satisface cualquier ruta que pida ADMIN — un solo lugar
    // para no tener que agregar SUPERADMIN a cada `@Roles(ADMIN)` suelto.
    const hasRole =
      requiredRoles.includes(roleCode as RoleTypeCode) ||
      (roleCode === RoleTypeCode.SUPERADMIN &&
        requiredRoles.includes(RoleTypeCode.ADMIN));
    if (!hasRole) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta acción',
      );
    }

    return true;
  }
}
