/** Referencia mínima a un catálogo (roleType / municipality / department). */
export interface CatalogRef {
  id: string | number;
  code?: string;
  name: string;
}

/** Item de usuario expuesto en el listado paginado (sin datos sensibles). */
export interface UserPaginatedListItem {
  id: string;
  fullName: string;
  username: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  identificationNumber: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  isBanned: boolean;
  isEmailVerified: boolean;
  roleType: CatalogRef | null;
  municipality: CatalogRef | null;
  department: CatalogRef | null;
  createdAt: Date | null;
}
