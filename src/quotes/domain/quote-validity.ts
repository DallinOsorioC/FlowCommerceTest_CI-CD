// Reglas de vigencia de una cotización (valid_until). Funciones puras: reciben
// "ahora" como parámetro para poder probarlas con una fecha fija.
//
// - null o undefined = sin vencimiento.
// - Al crear o editar no se acepta una fecha ya pasada.
// - Una cotización vencida no se puede aceptar: hay que hacer una nueva.

export function isInThePast(validUntil: Date | null | undefined, now: Date) {
  return validUntil instanceof Date && validUntil.getTime() < now.getTime();
}

export const isExpired = isInThePast;
