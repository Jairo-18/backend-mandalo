import {
  BadRequestException,
  ConflictException,
  ValidationError,
} from '@nestjs/common';

/**
 * Errores de validación con el CAMPO al que pertenecen, para que la app los
 * pinte debajo de cada input (antes solo llegaba la lista de textos y el
 * usuario tenía que adivinar qué campo no lo dejaba guardar).
 *
 * Respuesta: `message` sigue siendo la lista de textos (las apps viejas la
 * muestran en el toast) + `errors: { campo: primerMensaje }`. Los anidados
 * van con punto: `address.street`.
 */
export function validationExceptionFactory(errors: ValidationError[]) {
  const byField: Record<string, string> = {};
  const messages: string[] = [];

  const walk = (list: ValidationError[], prefix: string) => {
    for (const error of list) {
      const field = prefix ? `${prefix}.${error.property}` : error.property;
      const constraints = Object.entries(error.constraints ?? {}).map(
        ([rule, message]) => toSpanish(rule, message),
      );
      if (constraints.length) {
        messages.push(...constraints);
        byField[field] ??= constraints[0];
      }
      if (error.children?.length) walk(error.children, field);
    }
  };
  walk(errors, '');

  return new BadRequestException({
    statusCode: 400,
    message: messages,
    error: 'Bad Request',
    errors: byField,
  });
}

/**
 * Los mensajes POR DEFECTO de class-validator vienen en inglés ("name should
 * not be empty") y ahora se ven debajo del campo: se traducen por regla. Los
 * mensajes propios de los DTO (ya en español) quedan tal cual.
 */
function toSpanish(rule: string, message: string): string {
  const isDefault = /\b(should|must|is not)\b/.test(message);
  if (!isDefault) return message;
  const number = /(-?\d+(?:\.\d+)?)/.exec(message)?.[1];
  switch (rule) {
    case 'isNotEmpty':
    case 'isDefined':
      return 'Este campo es obligatorio.';
    case 'isEmail':
      return 'Ingresa un correo válido.';
    case 'maxLength':
      return `Máximo ${number} caracteres.`;
    case 'minLength':
      return `Mínimo ${number} caracteres.`;
    case 'max':
      return `El valor máximo es ${number}.`;
    case 'min':
      return `El valor mínimo es ${number}.`;
    case 'whitelistValidation':
      return 'Este campo no se puede enviar.';
    case 'isNumber':
    case 'isInt':
    case 'isPositive':
      return 'Ingresa un número válido.';
    default:
      return 'El valor no es válido.';
  }
}

/**
 * 409 de un dato que ya existe (correo, teléfono, NIT, código…), con el
 * campo para marcarlo en el formulario: `{ message, field }`.
 */
export function fieldConflict(field: string, message: string) {
  return new ConflictException({
    statusCode: 409,
    message,
    error: 'Conflict',
    field,
  });
}

/** 400 de UN campo (validación que depende de otro dato, p. ej. el tipo de documento). */
export function fieldBadRequest(field: string, message: string) {
  return new BadRequestException({
    statusCode: 400,
    message: [message],
    error: 'Bad Request',
    errors: { [field]: message },
  });
}
