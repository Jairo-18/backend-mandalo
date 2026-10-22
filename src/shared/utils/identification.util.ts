/**
 * Números de identificación colombianos, por tipo (`identificationType.code`):
 *
 * - CC (cédula de ciudadanía): solo dígitos, 3 a 10 (Registraduría; las más
 *   antiguas son cortas, las nuevas llegan a 10).
 * - TI (tarjeta de identidad): solo dígitos, 10 u 11.
 * - NIT (DIAN): el número base (5 a 10 dígitos: 9 para empresas; la cédula
 *   para personas naturales) y, opcional, el dígito de verificación (DV)
 *   separado con guion: `900123456-7`. Si viene el DV se comprueba con el
 *   algoritmo de la DIAN (módulo 11 con pesos primos, Orden Administrativa
 *   4 de 1989). El guion SOLO se permite en NIT.
 *
 * Nunca letras, puntos ni espacios. Mismas reglas que
 * `frontend-mandalo/src/lib/identification.ts`.
 */

/** Pesos de la DIAN, aplicados de derecha a izquierda sobre el NIT base. */
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Dígito de verificación (DV) de un NIT base (solo dígitos). */
export function nitCheckDigit(base: string): number {
  const digits = base.split('').reverse();
  const sum = digits.reduce(
    (acc, digit, i) => acc + Number(digit) * NIT_WEIGHTS[i],
    0,
  );
  const remainder = sum % 11;
  return remainder > 1 ? 11 - remainder : remainder;
}

/** Mensaje de error del número según su tipo, o null si es válido. */
export function identificationError(
  typeCode: string | null | undefined,
  value: string,
): string | null {
  const number = value.trim();
  if (typeCode === 'NIT') {
    const match = /^(\d{5,10})(?:-(\d))?$/.exec(number);
    if (!match) {
      return 'El NIT lleva solo números y, si quieres, el dígito de verificación con guion (ej: 900123456-7).';
    }
    if (match[2] !== undefined) {
      const expected = nitCheckDigit(match[1]);
      if (Number(match[2]) !== expected) {
        return `El dígito de verificación no corresponde a este NIT (debería ser ${expected}).`;
      }
    }
    return null;
  }
  if (!/^\d+$/.test(number)) {
    return 'Solo números: sin letras, puntos, espacios ni guiones.';
  }
  if (typeCode === 'TI' && (number.length < 10 || number.length > 11)) {
    return 'La tarjeta de identidad tiene 10 u 11 dígitos.';
  }
  if (typeCode === 'CC' && (number.length < 3 || number.length > 10)) {
    return 'La cédula tiene entre 3 y 10 dígitos.';
  }
  return null;
}
