import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { BadRequestException } from '../../common/exceptions/domain.exceptions';

export type HostResolver = (hostname: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map(
    (entry) => entry.address,
  );

export interface UrlGuardOptions {
  // Solo para desarrollo/pruebas: permite http:// y hosts de red privada
  // (un receptor en localhost). NUNCA en producción.
  allowPrivateTargets: boolean;
  resolver?: HostResolver;
}

function ipv4ToInt(ip: string): number {
  return (
    ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0
  );
}

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "esta red"
  ['10.0.0.0', 8], // privada
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local: incluye el metadata de la nube (169.254.169.254)
  ['172.16.0.0', 12], // privada
  ['192.0.0.0', 24], // reservada IETF
  ['192.168.0.0', 16], // privada
  ['198.18.0.0', 15], // pruebas de red
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservada
];

function isBlockedV4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (ipv4ToInt(base) & mask) >>> 0;
  });
}

// IPv6 → 8 grupos de 16 bits (null si no es válida). Acepta "::" y la cola
// IPv4 punteada. Hay que analizarla completa: new URL() normaliza
// [::ffff:10.0.0.1] a [::ffff:a00:1], y una comparación de texto no la ve.
function parseIPv6(raw: string): number[] | null {
  let text = raw.split('%')[0];
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const octets = dotted[2].split('.').map(Number);
    if (octets.some((octet) => octet > 255)) {
      return null;
    }
    text = `${dotted[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${(
      (octets[2] << 8) |
      octets[3]
    ).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) {
    return null;
  }
  const groups = [...head, ...Array<string>(missing).fill('0'), ...tail].map(
    (group) => parseInt(group, 16),
  );
  return groups.length === 8 &&
    groups.every((group) => Number.isInteger(group) && group <= 0xffff)
    ? groups
    : null;
}

const embeddedV4 = (high: number, low: number): string =>
  `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;

// true si la IP es de un rango que un webhook jamás debería alcanzar.
export function isBlockedAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (isIP(ip) === 4) {
    return isBlockedV4(ip);
  }
  const g = parseIPv6(ip);
  if (!g) {
    return true; // lo que no se puede analizar, no se visita
  }
  // ::, ::1, ::a.b.c.d (compatible) y ::ffff:a.b.c.d (mapeada): se evalúa la
  // IPv4 que llevan dentro.
  if (
    g.slice(0, 5).every((group) => group === 0) &&
    (g[5] === 0 || g[5] === 0xffff)
  ) {
    return isBlockedV4(embeddedV4(g[6], g[7]));
  }
  // NAT64 (64:ff9b::/96) también lleva una IPv4 dentro.
  if (
    g[0] === 0x64 &&
    g[1] === 0xff9b &&
    g.slice(2, 6).every((group) => group === 0)
  ) {
    return isBlockedV4(embeddedV4(g[6], g[7]));
  }
  return (
    g[0] === 0x2002 || // 6to4: IPv4 incrustada
    (g[0] === 0x2001 && g[1] === 0) || // Teredo
    (g[0] & 0xfe00) === 0xfc00 || // fc00::/7 única local
    (g[0] & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (g[0] & 0xffc0) === 0xfec0 || // fec0::/10 site-local (obsoleta)
    (g[0] & 0xff00) === 0xff00 // multicast
  );
}

// Valida la URL de un webhook y resuelve su host. Evita SSRF: que un usuario
// registre como «webhook» http://169.254.169.254/… o un servicio interno y use
// a Flowcommerce para llegar a él. Se llama al registrar Y antes de cada envío
// (el DNS puede cambiar entre ambos momentos).
export async function assertSafeWebhookUrl(
  rawUrl: string,
  options: UrlGuardOptions,
): Promise<URL> {
  return (await resolveSafeWebhookTarget(rawUrl, options)).url;
}

export interface SafeWebhookTarget {
  url: URL;
  // IP ya validada a la que hay que conectar (null = sin fijar, solo en el
  // modo de desarrollo con destinos privados).
  address: { address: string; family: 4 | 6 } | null;
}

// Igual que assertSafeWebhookUrl, pero devuelve además la IP validada: quien
// envía debe conectar a ESA IP y no volver a resolver el nombre (DNS rebinding).
export async function resolveSafeWebhookTarget(
  rawUrl: string,
  options: UrlGuardOptions,
): Promise<SafeWebhookTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Webhook url is not a valid URL');
  }
  if (
    url.protocol !== 'https:' &&
    !(options.allowPrivateTargets && url.protocol === 'http:')
  ) {
    throw new BadRequestException('Webhook url must use https');
  }
  if (url.username || url.password) {
    throw new BadRequestException('Webhook url must not contain credentials');
  }
  if (options.allowPrivateTargets) {
    return { url, address: null };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const resolver = options.resolver ?? defaultResolver;
  let addresses: string[];
  try {
    addresses = isIP(hostname) ? [hostname] : await resolver(hostname);
  } catch {
    throw new BadRequestException('Webhook host could not be resolved');
  }
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    throw new BadRequestException(
      'Webhook host resolves to a private or reserved address',
    );
  }
  return {
    url,
    address: {
      address: addresses[0],
      family: isIP(addresses[0]) === 6 ? 6 : 4,
    },
  };
}
