/**
 * ¿El negocio está abierto en este momento?
 *
 * El horario se guarda en HORA LOCAL DE COLOMBIA (America/Bogota, UTC-5 fijo:
 * Colombia no tiene horario de verano), pero el servidor puede correr en
 * cualquier zona (el VPS está en UTC) — por eso el "ahora" se desplaza a
 * Bogotá antes de comparar.
 *
 * Reglas:
 * - `temporarilyClosed` manda sobre todo (candado manual del negocio).
 * - Sin `openTime`/`closeTime`: abierto (solo aplica `openDays` si existe).
 * - `openTime === closeTime`: abierto las 24 h de sus días abiertos.
 * - `closeTime < openTime`: horario nocturno que cruza medianoche
 *   (ej. 18:00–02:00 del sábado cubre la madrugada del domingo).
 */

const BOGOTA_OFFSET_HOURS = -5;

export interface BusinessHoursLike {
  openTime?: string | null;
  closeTime?: string | null;
  openDays?: string | null;
  temporarilyClosed?: boolean;
}

/** Minuto del día (0–1439) desde "HH:MM"; null si el formato no es válido. */
function toMinutes(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Días abiertos como set de números 0–6; null = abre todos los días. */
function parseOpenDays(openDays?: string | null): Set<number> | null {
  if (!openDays?.trim()) return null;
  const days = openDays
    .split(',')
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return days.length ? new Set(days) : null;
}

export function isBusinessOpen(
  business: BusinessHoursLike,
  now: Date = new Date(),
): boolean {
  if (business.temporarilyClosed) return false;

  // "Ahora" desplazado a Bogotá; se lee con los getters UTC del Date corrido.
  const bogota = new Date(
    now.getTime() + BOGOTA_OFFSET_HOURS * 60 * 60 * 1000,
  );
  const day = bogota.getUTCDay();
  const minute = bogota.getUTCHours() * 60 + bogota.getUTCMinutes();

  const days = parseOpenDays(business.openDays);
  const open = business.openTime ? toMinutes(business.openTime) : null;
  const close = business.closeTime ? toMinutes(business.closeTime) : null;

  // Sin horario (o mal formado): solo cuenta el día.
  if (open == null || close == null) {
    return days ? days.has(day) : true;
  }

  const opensToday = days ? days.has(day) : true;

  if (open === close) return opensToday; // 24 h en sus días abiertos
  if (close > open) return opensToday && minute >= open && minute < close;

  // Nocturno: desde openTime de un día abierto hasta closeTime del siguiente.
  if (minute >= open) return opensToday;
  if (minute < close) {
    const yesterday = (day + 6) % 7;
    return days ? days.has(yesterday) : true;
  }
  return false;
}
