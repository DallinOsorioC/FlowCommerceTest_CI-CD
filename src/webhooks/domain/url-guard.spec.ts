import { BadRequestException } from '../../common/exceptions/domain.exceptions';
import {
  assertSafeWebhookUrl,
  isBlockedAddress,
  resolveSafeWebhookTarget,
} from './url-guard';

const strict = (resolved: string[]) => ({
  allowPrivateTargets: false,
  resolver: () => Promise.resolve(resolved),
});

describe('assertSafeWebhookUrl (anti-SSRF)', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // metadata de la nube
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:10.0.0.1',
    // Lo que new URL() hace con [::ffff:10.0.0.1]: forma hexadecimal.
    '::ffff:a00:1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe', // metadata de la nube
    '0:0:0:0:0:ffff:a00:1', // sin comprimir
    '64:ff9b::a00:1', // NAT64 hacia 10.0.0.1
    '2002:a00:1::', // 6to4 con 10.0.0.1
    '2001:0:4136:e378:8000:63bf:3fff:fdd2', // Teredo
    '::a00:1', // IPv4-compatible
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '172.32.0.1',
    '172.15.255.255',
    '2606:4700::1111',
    '::ffff:808:808',
    '64:ff9b::808:808',
  ])('allows public %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it('accepts an https url that resolves to a public address', async () => {
    const url = await assertSafeWebhookUrl(
      'https://hooks.example.com/x',
      strict(['93.184.216.34']),
    );
    expect(url.hostname).toBe('hooks.example.com');
  });

  it('rejects a public-looking name that resolves to an internal address', async () => {
    await expect(
      assertSafeWebhookUrl('https://evil.example.com', strict(['10.0.0.5'])),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when ANY resolved address is internal (DNS with mixed answers)', async () => {
    await expect(
      assertSafeWebhookUrl(
        'https://evil.example.com',
        strict(['93.184.216.34', '169.254.169.254']),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    'http://hooks.example.com',
    'ftp://hooks.example.com',
    'https://user:pass@hooks.example.com',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/hook',
    'not a url',
  ])('rejects %s', async (raw) => {
    await expect(
      assertSafeWebhookUrl(raw, strict(['93.184.216.34'])),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows http and localhost only when private targets are enabled (dev)', async () => {
    const url = await assertSafeWebhookUrl('http://localhost:4000/hook', {
      allowPrivateTargets: true,
    });
    expect(url.port).toBe('4000');
  });

  it('rejects a host that cannot be resolved', async () => {
    await expect(
      assertSafeWebhookUrl('https://nope.example.com', {
        allowPrivateTargets: false,
        resolver: () => Promise.reject(new Error('ENOTFOUND')),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    'https://[::ffff:10.0.0.1]/hook',
    'https://[::ffff:127.0.0.1]/hook',
    'https://[::ffff:169.254.169.254]/latest',
    'https://[64:ff9b::a00:1]/hook',
  ])('rejects the URL %s exactly as a client would send it', async (raw) => {
    await expect(
      assertSafeWebhookUrl(raw, strict(['93.184.216.34'])),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the validated IP so the sender can connect to it (no second DNS lookup)', async () => {
    const target = await resolveSafeWebhookTarget(
      'https://hooks.example.com/x',
      strict(['93.184.216.34']),
    );
    expect(target.address).toEqual({ address: '93.184.216.34', family: 4 });
  });
});
