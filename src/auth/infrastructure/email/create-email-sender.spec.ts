import { ConfigService } from '@nestjs/config';
import { ConsoleEmailSender } from './console-email-sender';
import { createEmailSender } from './create-email-sender';
import { ResendEmailSender } from './resend-email-sender';

describe('createEmailSender', () => {
  const config = (env: Record<string, string | undefined>) =>
    ({ get: (key: string) => env[key] }) as unknown as ConfigService;

  it('returns Resend when API key and from are configured', () => {
    const sender = createEmailSender(
      config({
        RESEND_API_KEY: 're_123',
        EMAIL_FROM: 'no-reply@flowcommerce.com',
        NODE_ENV: 'production',
      }),
    );

    expect(sender).toBeInstanceOf(ResendEmailSender);
  });

  it('fails explicitly in production without credentials', () => {
    expect(() => createEmailSender(config({ NODE_ENV: 'production' }))).toThrow(
      /RESEND_API_KEY and EMAIL_FROM are required in production/,
    );
  });

  it('fails explicitly in production when only the key is missing', () => {
    expect(() =>
      createEmailSender(
        config({
          EMAIL_FROM: 'no-reply@flowcommerce.com',
          NODE_ENV: 'production',
        }),
      ),
    ).toThrow(/Invalid email configuration/);
  });

  it('falls back to the console sender outside production', () => {
    expect(createEmailSender(config({ NODE_ENV: 'test' }))).toBeInstanceOf(
      ConsoleEmailSender,
    );
    expect(
      createEmailSender(config({ NODE_ENV: 'development' })),
    ).toBeInstanceOf(ConsoleEmailSender);
  });
});
