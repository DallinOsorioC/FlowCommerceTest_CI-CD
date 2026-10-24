// Límites de peticiones por IP para los endpoints públicos (M2).
//
// Los valores se leen de variables de entorno EN CADA PETICIÓN (funciones, no
// constantes): los decoradores se evalúan al cargar el código, antes de que
// ConfigModule lea el .env, y así los e2e también pueden cambiarlos.
//
//   THROTTLE_ENABLED=false            desactiva todos los límites (e2e)
//   THROTTLE_<NOMBRE>_LIMIT=<n>       peticiones permitidas en la ventana
//   THROTTLE_<NOMBRE>_TTL_MS=<ms>     tamaño de la ventana
//
// Al superar el límite, ThrottlerGuard responde 429 y GlobalExceptionFilter lo
// devuelve con el formato de error de siempre.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const envInt = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export const isThrottleDisabled = (): boolean =>
  process.env.THROTTLE_ENABLED === 'false';

// Opciones para @Throttle({ default: ... }) con el nombre de la variable.
const rule = (name: string, limit: number, ttlMs: number) => ({
  default: {
    limit: () => envInt(`THROTTLE_${name}_LIMIT`, limit),
    ttl: () => envInt(`THROTTLE_${name}_TTL_MS`, ttlMs),
  },
});

export const THROTTLE = {
  // El login, el registro y la recuperación de contraseña los limita
  // Supabase Auth (rate limits del proyecto), no esta API.
  accessRequest: rule('ACCESS_REQUEST', 5, HOUR),
  // Aceptar una invitación (token por correo).
  invitation: rule('INVITATION', 10, HOUR),
};
