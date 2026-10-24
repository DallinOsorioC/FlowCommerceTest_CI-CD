import { extname } from 'node:path';

// Reglas de los archivos que acepta el CRM.

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

// Tipos permitidos y la extensión con la que se guardan. Coinciden con lo que
// WhatsApp Cloud API acepta para imágenes, documentos, audio y video, para que
// un adjunto del CRM se pueda reenviar por WhatsApp.
export const ATTACHMENT_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    '.pptx',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/amr': '.amr',
  'video/mp4': '.mp4',
  'video/3gpp': '.3gp',
};

export const AVATAR_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Tipo MIME sin parámetros ("audio/ogg; codecs=opus" → "audio/ogg").
export function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

// Firma (primeros bytes) de los formatos más comunes. Evita que un ejecutable
// renombrado a .png entre como imagen solo porque el navegador dijo
// "image/png". Los formatos sin firma conocida no se comprueban.
const SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
};

export function contentMatchesType(mimeType: string, content: Buffer): boolean {
  const check = SIGNATURES[baseMimeType(mimeType)];
  return check ? check(content) : true;
}

// Nombre para mostrar y para la descarga: sin carpetas, sin caracteres de
// control y con un máximo de 255 caracteres. Nunca se usa como ruta en disco.
export function safeFileName(
  original: string | undefined,
  fallbackExt: string,
): string {
  const base = (original ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .trim();
  if (!base) {
    return `archivo${fallbackExt}`;
  }
  if (base.length <= 255) {
    return base;
  }
  const ext = extname(base).slice(0, 20);
  return base.slice(0, 255 - ext.length) + ext;
}

// Content-Disposition con el nombre en UTF-8 (RFC 5987) y una versión ASCII
// de respaldo para navegadores antiguos.
export function contentDisposition(
  fileName: string,
  disposition: 'inline' | 'attachment' = 'attachment',
): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
