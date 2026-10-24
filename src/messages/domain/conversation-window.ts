// Regla de WhatsApp Cloud API: un negocio solo puede enviar mensajes de texto
// libre durante las 24 h siguientes al ÚLTIMO mensaje que escribió el cliente.
// Fuera de esa ventana Meta solo acepta plantillas aprobadas y rechaza el
// envío (el webhook lo reporta como FAILED, código 131047).
//
// El backend calcula hasta cuándo está abierta la ventana para que el frontend
// avise al usuario o deshabilite el cuadro de texto.
export const WHATSAPP_WINDOW_HOURS = 24;

const WINDOW_MS = WHATSAPP_WINDOW_HOURS * 60 * 60 * 1000;

// null = el cliente nunca escribió (no hay ventana).
export function windowOpenUntil(lastInboundAt: Date | null): Date | null {
  return lastInboundAt ? new Date(lastInboundAt.getTime() + WINDOW_MS) : null;
}

export function isWindowOpen(lastInboundAt: Date | null, now: Date): boolean {
  const until = windowOpenUntil(lastInboundAt);
  return until !== null && until.getTime() > now.getTime();
}
