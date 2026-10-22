import { Promotion } from '../shared/entities/promotion.entity';

/** Estado de una promoción tal como lo ve el negocio en "Mis publicidades". */
export type PromotionStatus = 'ACTIVE' | 'SCHEDULED' | 'PAUSED' | 'EXPIRED' | 'HIDDEN';

export function promotionStatus(p: Promotion, now = new Date()): PromotionStatus {
  if (p.hiddenByAdmin) return 'HIDDEN';
  if (new Date(p.endsAt) <= now) return 'EXPIRED';
  if (!p.isActive) return 'PAUSED';
  if (new Date(p.startsAt) > now) return 'SCHEDULED';
  return 'ACTIVE';
}

/**
 * ¿Se puede mostrar y comprar AHORA? Activa, no oculta por el admin, dentro
 * de su vigencia y con todos sus productos todavía activos. Es la MISMA
 * regla del carrusel del home y de la validación al crear el pedido.
 */
export function isPromotionLive(p: Promotion, now = new Date()): boolean {
  return (
    promotionStatus(p, now) === 'ACTIVE' &&
    (p.items ?? []).length > 0 &&
    (p.items ?? []).every((item) => item.product?.isActive !== false)
  );
}

/** "2× Hamburguesa doble, 1× Coca-Cola" — contenido de la promo en texto. */
export function promotionItemsDescription(p: Promotion): string {
  return (p.items ?? [])
    .map((item) => `${item.quantity}× ${item.product?.name ?? 'Producto'}`)
    .join(', ')
    .slice(0, 500);
}
