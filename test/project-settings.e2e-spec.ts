import request from 'supertest';
import {
  createE2eApp,
  type E2eContext,
  type Role,
  type SeededTenants,
} from './support/e2e-app';

interface ProjectBody {
  id: string;
  name: string;
  slug: string;
  billing: {
    legalName: string | null;
    taxId: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  quoteSettings: {
    taxPercent: number;
    folioPrefix: string;
    validityDays: number;
    defaultTerms: string | null;
    currency: string;
  };
}

interface QuoteBody {
  id: string;
  folio: string;
  tax: number;
  total: number;
  terms: string | null;
  validUntil: string | null;
  creadoEn: string;
}

interface ProfileBody {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  position: string | null;
}

// Proyecto y ajustes (perfil de facturación, ajustes de cotización) y perfil
// del propio usuario. Los ajustes deben gobernar las cotizaciones nuevas.
describe('Project settings & profile (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;

  const http = () => request(ctx.app.getHttpServer());
  const as = (key: string, role: Role) => ctx.cookie(seed.user(key, role));
  const url = (key = 'A') => `/api/v1/projects/${seed.project(key)}`;

  beforeAll(async () => {
    ctx = await createE2eApp();
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1, ADMIN: 1, MEMBER: 1, VIEWER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
    ]);
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  describe('GET /projects/:id', () => {
    it('returns defaults for a project that never configured anything', async () => {
      const body = (
        await http().get(url()).set('Cookie', as('A', 'VIEWER')).expect(200)
      ).body as ProjectBody;

      expect(body.id).toBe(seed.project('A'));
      expect(body.billing).toEqual({
        legalName: null,
        taxId: null,
        address: null,
        phone: null,
        email: null,
      });
      expect(body.quoteSettings).toEqual({
        taxPercent: 12,
        folioPrefix: 'COT',
        validityDays: 30,
        defaultTerms: null,
        currency: 'GTQ',
      });
    });

    it('answers 403 for a project of another tenant and 401 without session', async () => {
      await http().get(url('B')).set('Cookie', as('A', 'OWNER')).expect(403);
      await http().get(url()).expect(401);
    });
  });

  describe('PATCH /projects/:id', () => {
    it('lets OWNER and ADMIN edit; MEMBER and VIEWER get 403', async () => {
      await http()
        .patch(url())
        .set('Cookie', as('A', 'OWNER'))
        .send({ name: 'Mi empresa' })
        .expect(200);
      await http()
        .patch(url())
        .set('Cookie', as('A', 'ADMIN'))
        .send({ description: 'Descripción' })
        .expect(200);

      for (const role of ['MEMBER', 'VIEWER'] as const) {
        await http()
          .patch(url())
          .set('Cookie', as('A', role))
          .send({ name: 'Hack' })
          .expect(403);
      }
      const body = (
        await http().get(url()).set('Cookie', as('A', 'VIEWER')).expect(200)
      ).body as ProjectBody;
      expect(body.name).toBe('Mi empresa');
    });

    it('stores the billing profile and merges partial updates', async () => {
      await http()
        .patch(url())
        .set('Cookie', as('A', 'OWNER'))
        .send({
          billing: {
            legalName: 'Mi Empresa S.A.S.',
            taxId: '900123456-7',
            email: 'facturacion@miempresa.com',
          },
        })
        .expect(200);

      const body = (
        await http()
          .patch(url())
          .set('Cookie', as('A', 'OWNER'))
          .send({ billing: { phone: '+57 1 234 5678', email: null } })
          .expect(200)
      ).body as ProjectBody;

      expect(body.billing).toEqual({
        legalName: 'Mi Empresa S.A.S.',
        taxId: '900123456-7',
        address: null,
        phone: '+57 1 234 5678',
        email: null,
      });
    });

    it('cannot change the slug or unknown fields', async () => {
      await http()
        .patch(url())
        .set('Cookie', as('A', 'OWNER'))
        .send({ slug: 'otro' })
        .expect(400);
      await http()
        .patch(url())
        .set('Cookie', as('A', 'OWNER'))
        .send({ quoteSettings: { secret: 1 } })
        .expect(400);
    });

    it.each([
      [{ quoteSettings: { taxPercent: 101 } }],
      [{ quoteSettings: { taxPercent: -1 } }],
      [{ quoteSettings: { folioPrefix: 'cot' } }],
      [{ quoteSettings: { folioPrefix: '' } }],
      [{ quoteSettings: { validityDays: 0 } }],
      [{ quoteSettings: { validityDays: 4000 } }],
      [{ quoteSettings: { currency: 'pesos' } }],
      [{ billing: { email: 'no-es-correo' } }],
      [{ name: '' }],
    ])('rejects invalid input %j with 400', async (body) => {
      await http()
        .patch(url())
        .set('Cookie', as('A', 'OWNER'))
        .send(body)
        .expect(400);
    });

    it('does not touch another tenant', async () => {
      await http()
        .patch(url('B'))
        .set('Cookie', as('A', 'OWNER'))
        .send({ name: 'Hack' })
        .expect(403);
      const body = (
        await http().get(url('B')).set('Cookie', as('B', 'OWNER')).expect(200)
      ).body as ProjectBody;
      expect(body.name).not.toBe('Hack');
    });
  });

  describe('quote settings drive new quotes', () => {
    it('applies tax, folio prefix, validity days and default terms', async () => {
      await http()
        .patch(url())
        .set('Cookie', as('A', 'OWNER'))
        .send({
          quoteSettings: {
            taxPercent: 10,
            folioPrefix: 'PRE',
            validityDays: 7,
            defaultTerms: 'Pago a 30 días',
            currency: 'USD',
          },
        })
        .expect(200);

      const leadId = (
        await http()
          .post(`${url()}/leads`)
          .set('Cookie', as('A', 'OWNER'))
          .send({ name: 'Lead' })
          .expect(201)
      ).body as { id: string };
      const productId = (
        await http()
          .post(`${url()}/products`)
          .set('Cookie', as('A', 'OWNER'))
          .send({ name: 'Servicio', price: 100 })
          .expect(201)
      ).body as { id: string };

      const quote = (
        await http()
          .post(`${url()}/quotes`)
          .set('Cookie', as('A', 'OWNER'))
          .send({
            leadId: leadId.id,
            items: [{ productId: productId.id, quantity: 2 }],
          })
          .expect(201)
      ).body as QuoteBody;

      expect(quote.folio).toBe('PRE-000001');
      expect(quote.tax).toBe(20);
      expect(quote.total).toBe(220);
      expect(quote.terms).toBe('Pago a 30 días');
      const days =
        (new Date(quote.validUntil as string).getTime() -
          new Date(quote.creadoEn).getTime()) /
        86_400_000;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThan(7.01);

      // Un valor explícito en el body gana sobre el ajuste por defecto.
      const explicit = (
        await http()
          .post(`${url()}/quotes`)
          .set('Cookie', as('A', 'OWNER'))
          .send({ leadId: leadId.id, validUntil: null, terms: 'Otras' })
          .expect(201)
      ).body as QuoteBody;
      expect(explicit.validUntil).toBeNull();
      expect(explicit.terms).toBe('Otras');
      expect(explicit.folio).toBe('PRE-000002');

      // Cambiar el IVA después no reescribe las cotizaciones ya creadas.
      await http()
        .patch(url())
        .set('Cookie', as('A', 'OWNER'))
        .send({ quoteSettings: { taxPercent: 0 } })
        .expect(200);
      const stored = (
        await http()
          .get(`${url()}/quotes/${quote.id}`)
          .set('Cookie', as('A', 'OWNER'))
          .expect(200)
      ).body as QuoteBody;
      expect(stored.tax).toBe(20);
    });
  });

  describe('/users/me', () => {
    it('reads and updates phone and position of the session user only', async () => {
      const me = '/api/v1/users/me';
      const first = (
        await http().get(me).set('Cookie', as('A', 'MEMBER')).expect(200)
      ).body as ProfileBody;
      expect(first.id).toBe(seed.user('A', 'MEMBER'));
      expect(first.phone).toBeNull();

      const updated = (
        await http()
          .patch(me)
          .set('Cookie', as('A', 'MEMBER'))
          .send({ phone: '+57 300 123 4567', position: 'Ejecutivo' })
          .expect(200)
      ).body as ProfileBody;
      expect(updated).toMatchObject({
        id: seed.user('A', 'MEMBER'),
        phone: '+57 300 123 4567',
        position: 'Ejecutivo',
      });

      // Un cambio parcial no borra lo demás; null sí borra.
      const partial = (
        await http()
          .patch(me)
          .set('Cookie', as('A', 'MEMBER'))
          .send({ position: null })
          .expect(200)
      ).body as ProfileBody;
      expect(partial.phone).toBe('+57 300 123 4567');
      expect(partial.position).toBeNull();

      // El resto de usuarios no se ve afectado.
      const other = (
        await http().get(me).set('Cookie', as('A', 'OWNER')).expect(200)
      ).body as ProfileBody;
      expect(other.phone).toBeNull();
    });

    it('lets each user edit their own name, but never an empty one', async () => {
      const me = '/api/v1/users/me';
      const renamed = (
        await http()
          .patch(me)
          .set('Cookie', as('A', 'MEMBER'))
          .send({ name: '  Ana López  ' })
          .expect(200)
      ).body as ProfileBody;
      expect(renamed.name).toBe('Ana López');

      await http()
        .patch(me)
        .set('Cookie', as('A', 'MEMBER'))
        .send({ name: '   ' })
        .expect(400);
    });

    it('cannot change identity fields and requires a session', async () => {
      const me = '/api/v1/users/me';
      for (const body of [
        { email: 'otro@example.com' },
        { id: seed.user('A', 'OWNER') },
      ]) {
        await http()
          .patch(me)
          .set('Cookie', as('A', 'MEMBER'))
          .send(body)
          .expect(400);
      }
      await http().get(me).expect(401);
      await http().patch(me).send({ phone: '1' }).expect(401);
    });

    it('rejects values that are too long', async () => {
      await http()
        .patch('/api/v1/users/me')
        .set('Cookie', as('A', 'MEMBER'))
        .send({ phone: 'x'.repeat(33) })
        .expect(400);
    });
  });
});
