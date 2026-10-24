// NIT normalizado (C2): sin espacios, guiones ni puntos y en mayúsculas.
// "7745213-8", "77452138" y "7745213 8" son el mismo NIT → "77452138"; así el
// índice único por proyecto detecta los duplicados. Un NIT que queda vacío
// tras normalizar se guarda como null (sin NIT).
//
// undefined se respeta ("no tocar" en un PATCH).
export function normalizeTaxId(value: string): string | null;
export function normalizeTaxId(value: null): null;
export function normalizeTaxId(value: undefined): undefined;
export function normalizeTaxId(value: string | null): string | null;
export function normalizeTaxId(
  value: string | null | undefined,
): string | null | undefined;
export function normalizeTaxId(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  const normalized = value.replace(/[\s.-]/g, '').toUpperCase();
  return normalized === '' ? null : normalized;
}
