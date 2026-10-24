import request from 'supertest';
import {
  createE2eApp,
  type E2eContext,
  type SeededTenants,
} from './support/e2e-app';

interface DashboardBody {
  summary: {
    leadsActivos: number;
    cotizacionesEnRevision: number;
    ganado: number;
    pipeline: number;
  };
  quotes: { porEstado: Record<string, number> };
}

// Pipeline del Dashboard: suma de estimatedValue de los leads activos (todo
// menos WON y LOST), y los estados nuevos de cotización siempre presentes.
describe('Dashboard pipeline (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;

  const http = () => request(ctx.app.getHttpServer());
  const owner = (key: string) => ctx.cookie(seed.user(key, 'OWNER'));
  const base = (key: string) => `/api/v1/projects/${seed.project(key)}`;

  const addLead = (key: string, stage: string, estimatedValue?: number) =>
    http()
      .post(`${base(key)}/leads`)
      .set('Cookie', owner(key))
      .send({ name: `Lead ${stage}`, stage, estimatedValue })
      .expect(201);

  const dashboard = async (key: string) =>
    (
      await http()
        .get(`${base(key)}/dashboard`)
        .set('Cookie', owner(key))
        .expect(200)
    ).body as DashboardBody;

  beforeAll(async () => {
    ctx = await createE2eApp();
    seed = await ctx.seedTenants([
      { key: 'A', members: { OWNER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
      { key: 'EMPTY', members: { OWNER: 1 } },
    ]);

    await addLead('A', 'NEW', 1000.1);
    await addLead('A', 'CONTACTED', 2000.2);
    await addLead('A', 'QUALIFIED'); // sin valor: suma 0
    await addLead('A', 'PROPOSAL', 3000);
    await addLead('A', 'NEGOTIATION', 0.7);
    await addLead('A', 'WON', 50000);
    await addLead('A', 'LOST', 70000);

    // Otro tenant con mucho valor: no debe colarse en el pipeline de A.
    await addLead('B', 'NEW', 999999);
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  it('sums only the estimated value of active leads', async () => {
    const body = await dashboard('A');

    // 1000.10 + 2000.20 + 3000 + 0.70 = 6001.00 (WON y LOST excluidos)
    expect(body.summary.pipeline).toBe(6001);
    expect(body.summary.leadsActivos).toBe(5);
    expect(body.summary.ganado).toBe(1);
  });

  it('is scoped to the tenant', async () => {
    expect((await dashboard('B')).summary.pipeline).toBe(999999);
  });

  it('is 0 for a project without leads', async () => {
    expect((await dashboard('EMPTY')).summary.pipeline).toBe(0);
  });

  it('always reports the seven quote states, with 0 when empty', async () => {
    const body = await dashboard('EMPTY');

    expect(Object.keys(body.quotes.porEstado)).toEqual([
      'DRAFT',
      'PENDING_APPROVAL',
      'APPROVED',
      'SENT',
      'ACCEPTED',
      'PAID',
      'REJECTED',
    ]);
    expect(Object.values(body.quotes.porEstado).every((n) => n === 0)).toBe(
      true,
    );
  });
});
