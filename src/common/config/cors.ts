// Orígenes del navegador autorizados a llamar a la API.
//
// Se leen de CORS_ORIGINS (lista separada por comas). Si no está definida se usa
// APP_URL, que ya es la URL del frontend para los enlaces de recuperación de
// contraseña. Nunca se permite '*': con credentials: true el navegador lo
// rechaza y, además, abriría la API a cualquier sitio.
export function parseCorsOrigins(
  corsOrigins: string | undefined,
  appUrl: string | undefined,
): string[] {
  const raw = corsOrigins?.trim() ? corsOrigins : (appUrl ?? '');

  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0 && origin !== '*');
}
