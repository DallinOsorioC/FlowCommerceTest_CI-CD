import type { LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { WebhookHttp } from '../application/webhook-dispatcher';

// POST que conecta a la IP que el guard anti-SSRF ya validó, en vez de volver
// a resolver el nombre: así un DNS que cambia entre la validación y el envío
// (DNS rebinding) no puede llevar la petición a una IP interna. El nombre
// original se conserva en Host y SNI, por lo que el certificado se valida
// igual. Tampoco sigue redirecciones.
//
// La respuesta se descarta con resume(): sin consumir el cuerpo el socket
// queda retenido hasta que el recolector de basura lo libere.
export const pinnedHttp: WebhookHttp = (url, init) =>
  new Promise((resolve, reject) => {
    const client = url.protocol === 'http:' ? http : https;
    const pinned = init.address;
    const request = client.request(
      url,
      {
        method: init.method,
        headers: {
          ...init.headers,
          'Content-Length': Buffer.byteLength(init.body),
        },
        signal: init.signal,
        ...(pinned
          ? {
              lookup: (
                _hostname: string,
                options: { all?: boolean },
                callback: (
                  error: NodeJS.ErrnoException | null,
                  address: string | LookupAddress[],
                  family?: number,
                ) => void,
              ) =>
                options.all
                  ? callback(null, [pinned])
                  : callback(null, pinned.address, pinned.family),
            }
          : {}),
      },
      (response) => {
        response.resume();
        resolve({ status: response.statusCode ?? 0 });
      },
    );
    request.on('error', reject);
    request.end(init.body);
  });
