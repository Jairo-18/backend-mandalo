import { SetMetadata } from '@nestjs/common';
import { RoleTypeCode } from '../roles/roleTypeCode.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleTypeCode[]) =>
  SetMetadata(ROLES_KEY, roles);
