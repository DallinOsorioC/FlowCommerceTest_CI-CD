// Configuración HTTP que depende del entorno (B9). Funciones puras para poder
// probarlas sin levantar la app.

// Swagger: activo fuera de producción salvo SWAGGER_ENABLED=false; en
// producción solo con SWAGGER_ENABLED=true.
export function isSwaggerEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.SWAGGER_ENABLED === 'true') return true;
  if (env.SWAGGER_ENABLED === 'false') return false;
  return env.NODE_ENV !== 'production';
}

// TRUST_PROXY: número de proxies delante de la API ("1" en la mayoría de
// hostings), "true"/"false", o vacío para no tocar el valor de Express.
export function trustProxySetting(
  value: string | undefined,
): number | boolean | undefined {
  if (!value) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const hops = Number(value);
  return Number.isInteger(hops) && hops >= 0 ? hops : undefined;
}
