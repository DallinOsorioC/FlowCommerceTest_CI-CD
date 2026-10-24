import request from 'supertest';
import {
  createE2eApp,
  type E2eContext,
  type SeededTenants,
} from './support/e2e-app';

// Validaciones añadidas tras la auditoría en Products y Clients:
//   P2 nombre de producto único sin distinguir mayúsculas,
//   P3 / C5 nombres con solo espacios,
//   C2 NIT normalizado,
//   B10 cotizaciones y ventas por fila en el listado de clientes,
//   C4 / P4 lead que apunta a un cliente o producto desactivado.
describe('Catalog and clients validation (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;

  const http = () => request(ctx.app.getHttpServer());
  const owner = (key = 'A') => ctx.cookie(seed.user(key, 'OWNER'));
  const url = (path: string, key = 'A') =>
    `/api/v1/projects/${seed.project(key)}${path}`;
  const post = (path: string, body: object, key = 'A') =>
    http().post(url(path, key)).set('Cookie', owner(key)).send(body);
  const patch = (path: string, body: object, key = 'A') =>
    http().patch(url(path, key)).set('Cookie', owner(key)).send(body);
  const idOf = (res: { body: unknown }) => (res.body as { id: string }).id;

  beforeAll(async () => {
    ctx = await createE2eApp();
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
    ]);
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  it('P2: product names are unique ignoring case (409)', async () => {
    await post('/products', { name: 'Licencia Pro', price: 10 }).expect(201);
    await post('/products', { name: 'licencia pro', price: 10 }).expect(409);
    // En otro proyecto sí se puede.
    await post('/products', { name: 'LICENCIA PRO', price: 10 }, 'B').expect(
      201,
    );
  });

  it('P3 / C5: names with only spaces are rejected (400)', async () => {
    await post('/products', { name: '   ', price: 10 }).expect(400);
    await post('/clients', { name: '   ' }).expect(400);
    const client = idOf(await post('/clients', { name: 'Con nombre' }));
    await patch(`/clients/${client}`, { name: '  ' }).expect(400);
  });

  it('C2: the tax id is stored normalized and duplicates are detected', async () => {
    const created = await post('/clients', {
      name: 'Transportes Quetzal',
      taxId: '7745213-8',
    }).expect(201);
    expect((created.body as { taxId: string }).taxId).toBe('77452138');

    await post('/clients', { name: 'Duplicado', taxId: '77452138' }).expect(
      409,
    );
    await post('/clients', { name: 'Duplicado 2', taxId: '7745213 8' }).expect(
      409,
    );
  });

  it('B10: each client row carries its quotes count and PAID sales', async () => {
    const client = idOf(await post('/clients', { name: 'Con ventas' }));
    const lead = idOf(await post('/leads', { name: 'Lead', clientId: client }));
    const product = idOf(
      await post('/products', { name: 'Servicio B10', price: 1000 }),
    );
    const quote = idOf(
      await post('/quotes', {
        leadId: lead,
        clientId: client,
        items: [{ productId: product, quantity: 1 }],
      }).expect(201),
    );
    await post('/quotes', { leadId: lead, clientId: client }).expect(201);
    for (const status of [
      'PENDING_APPROVAL',
      'APPROVED',
      'SENT',
      'ACCEPTED',
      'PAID',
    ]) {
      await patch(`/quotes/${quote}/status`, { status }).expect(200);
    }

    const list = await http()
      .get(url('/clients?search=Con%20ventas'))
      .set('Cookie', owner())
      .expect(200);
    const row = (
      list.body as {
        data: {
          id: string;
          quotesCount: number;
          paidQuotesCount: number;
          salesTotal: number;
        }[];
      }
    ).data.find((item) => item.id === client);

    // 1 cotización PAID de 1000 + IVA 12 % = 1120, y un borrador vacío.
    expect(row).toMatchObject({
      quotesCount: 2,
      paidQuotesCount: 1,
      salesTotal: 1120,
    });
  });

  it('C4 / P4: a lead cannot point to an inactive client or product (409)', async () => {
    const client = idOf(await post('/clients', { name: 'Inactivo' }));
    await patch(`/clients/${client}`, { active: false }).expect(200);
    await post('/leads', { name: 'Lead', clientId: client }).expect(409);

    const product = idOf(
      await post('/products', { name: 'Descontinuado', price: 5 }),
    );
    await patch(`/products/${product}`, { active: false }).expect(200);
    await post('/leads', { name: 'Lead', interestProductId: product }).expect(
      409,
    );
  });
});
