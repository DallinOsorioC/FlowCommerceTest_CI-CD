// Identifica el SQLSTATE 23505 (unique_violation).
//
// Drizzle envuelve los errores del driver en un DrizzleQueryError y deja el
// SQLSTATE real en `error.cause.code`; el nivel de anidamiento depende de la
// versión. Por eso se recorre la cadena de `cause` en vez de mirar solo el
// primer nivel (que dejaría escapar la violación como un 500).
export function isUniqueViolation(error: unknown): boolean {
  return hasPostgresCode(error, '23505');
}

// SQLSTATE 23503 (foreign_key_violation).
export function isForeignKeyViolation(error: unknown): boolean {
  return hasPostgresCode(error, '23503');
}

// Nombre de la constraint violada (FK, unique, check), si el driver lo expone.
// postgres-js lo deja en `constraint_name`; se busca en la cadena de `cause`.
export function violatedConstraint(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 10; depth++) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    const name = (current as { constraint_name?: unknown }).constraint_name;
    if (typeof name === 'string') {
      return name;
    }
    if (!('cause' in current)) {
      return undefined;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function hasPostgresCode(error: unknown, code: string): boolean {
  let current = error;
  for (let depth = 0; depth < 10; depth++) {
    if (typeof current !== 'object' || current === null) {
      return false;
    }
    if ((current as { code?: unknown }).code === code) {
      return true;
    }
    if (!('cause' in current)) {
      return false;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
