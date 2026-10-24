import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL ??=
  'postgresql://flowcommerce:flowcommerce@localhost:5432/flowcommerce_dev';
process.env.NODE_ENV ??= 'test';
// Los límites por IP harían fallar a las suites que repiten login o sign-up;
// test/rate-limit.e2e-spec.ts los activa solo para él.
process.env.THROTTLE_ENABLED ??= 'false';
// El job de recordatorios no corre solo en los e2e: los tests llaman al caso
// de uso cuando lo necesitan.
process.env.SCHEDULER_ENABLED ??= 'false';
// Los archivos de los e2e van a una carpeta temporal, nunca a ./uploads.
process.env.FILE_STORAGE_DRIVER ??= 'local';
process.env.UPLOADS_DIR ??= join(tmpdir(), 'flowcommerce-e2e-uploads');
process.env.PAYMENTS_WEBHOOK_SECRET ??= 'e2e-payments-secret';
// Cifra tokens de WhatsApp y secretos de webhooks (64 hex = 32 bytes).
process.env.ENCRYPTION_KEY ??= 'a1'.repeat(32);
// No hay Meta en los e2e: guardar la conexión de WhatsApp no la verifica.
process.env.WHATSAPP_SKIP_CREDENTIAL_CHECK ??= 'true';
process.env.WHATSAPP_TOKEN ??= 'e2e-whatsapp-token';
process.env.WHATSAPP_PHONE_NUMBER_ID ??= 'e2e-phone-id';
process.env.WHATSAPP_APP_SECRET ??= 'e2e-whatsapp-app-secret';
process.env.WHATSAPP_VERIFY_TOKEN ??= 'e2e-whatsapp-verify-token';

// Supabase Auth: los e2e no hablan con Supabase (la sesión se simula con una
// cookie de prueba), pero el verificador de JWT sí se prueba con estas claves.
process.env.SUPABASE_URL ??= 'https://e2e-project.supabase.co';
process.env.SUPABASE_JWT_SECRET ??= 'e2e-supabase-jwt-secret-with-32-chars!!';
