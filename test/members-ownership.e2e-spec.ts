import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { clients, leads, memberships } from '../src/db/schema';
import {
  createE2eApp,
  type E2eContext,
  type Role,
  type SeededTenants,
} from './support/e2e-app';

// B2: un proyecto nunca puede quedarse sin OWNER, ni siquiera con dos
// peticiones simultáneas. C7: quien sale del proyecto deja de ser responsable
// de sus leads y clientes en ESE proyecto (no en otros).
describe('Members: last OWNER and assignments (e2e)', () => {
  let ctx: E2eContext;
  let seed: SeededTenants;

  const http = () => request(ctx.app.getHttpServer());
  const as = (key: string, role: Role, index = 0) =>
    ctx.cookie(seed.user(key, role, index));
  const members = (key: string) =>
    `/api/v1/projects/${seed.project(key)}/members`;
  const ownersOf = async (key: string) =>
    (
      await ctx.db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.projectId, seed.project(key)),
            eq(memberships.role, 'OWNER'),
          ),
        )
    ).length;

  beforeAll(async () => {
    ctx = await createE2eApp();
    seed = await ctx.seedTenants([
      { key: 'TWO', members: { OWNER: 2 } },
      { key: 'ONE', members: { OWNER: 1, ADMIN: 1 } },
      { key: 'RACE', members: { OWNER: 2 } },
      { key: 'RACE_DEL', members: { OWNER: 2 } },
      { key: 'A', members: { OWNER: 1, MEMBER: 1 } },
      { key: 'B', members: { OWNER: 1 } },
    ]);
  });

  afterAll(async () => {
    await seed.cleanup();
    await ctx.close();
  });

  it('demotes an OWNER when another OWNER remains', async () => {
    await http()
      .patch(`${members('TWO')}/${seed.membership('TWO', 'OWNER', 1)}`)
      .set('Cookie', as('TWO', 'OWNER', 0))
      .send({ role: 'ADMIN' })
      .expect(200);
    expect(await ownersOf('TWO')).toBe(1);
  });

  it('refuses to demote or remove the last OWNER (403) and changes nothing', async () => {
    const owner = seed.membership('ONE', 'OWNER');
    await http()
      .patch(`${members('ONE')}/${owner}`)
      .set('Cookie', as('ONE', 'OWNER'))
      .send({ role: 'ADMIN' })
      .expect(403);
    await http()
      .delete(`${members('ONE')}/${owner}`)
      .set('Cookie', as('ONE', 'OWNER'))
      .expect(403);
    expect(await ownersOf('ONE')).toBe(1);
  });

  it('lets exactly one of two simultaneous cross-demotions win', async () => {
    const [first, second] = await Promise.all([
      http()
        .patch(`${members('RACE')}/${seed.membership('RACE', 'OWNER', 1)}`)
        .set('Cookie', as('RACE', 'OWNER', 0))
        .send({ role: 'MEMBER' }),
      http()
        .patch(`${members('RACE')}/${seed.membership('RACE', 'OWNER', 0)}`)
        .set('Cookie', as('RACE', 'OWNER', 1))
        .send({ role: 'MEMBER' }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 403]);
    expect(await ownersOf('RACE')).toBe(1);
  });

  it('lets exactly one of two simultaneous cross-removals win', async () => {
    const responses = await Promise.all([
      http()
        .delete(
          `${members('RACE_DEL')}/${seed.membership('RACE_DEL', 'OWNER', 1)}`,
        )
        .set('Cookie', as('RACE_DEL', 'OWNER', 0)),
      http()
        .delete(
          `${members('RACE_DEL')}/${seed.membership('RACE_DEL', 'OWNER', 0)}`,
        )
        .set('Cookie', as('RACE_DEL', 'OWNER', 1)),
    ]);

    // El perdedor puede recibir 403 (último OWNER) o, si su propia membresía
    // ya no existe cuando se valida, 403 por no ser miembro.
    expect(responses.filter((r) => r.status === 204)).toHaveLength(1);
    expect(await ownersOf('RACE_DEL')).toBe(1);
  });

  it('C7: unassigns the removed member only in that project', async () => {
    const member = seed.user('A', 'MEMBER');
    // El mismo usuario también es miembro del proyecto B.
    await ctx.db.insert(memberships).values({
      userId: member,
      projectId: seed.project('B'),
      role: 'MEMBER',
    });
    const [leadA] = await ctx.db
      .insert(leads)
      .values({
        projectId: seed.project('A'),
        name: 'Lead A',
        assignedUserId: member,
      })
      .returning();
    const [clientA] = await ctx.db
      .insert(clients)
      .values({
        projectId: seed.project('A'),
        name: 'Cliente A',
        assignedUserId: member,
      })
      .returning();
    const [leadB] = await ctx.db
      .insert(leads)
      .values({
        projectId: seed.project('B'),
        name: 'Lead B',
        assignedUserId: member,
      })
      .returning();

    await http()
      .delete(`${members('A')}/${seed.membership('A', 'MEMBER')}`)
      .set('Cookie', as('A', 'OWNER'))
      .expect(204);

    const leadOwner = async (id: string) =>
      (await ctx.db.select().from(leads).where(eq(leads.id, id)))[0]
        ?.assignedUserId;
    const clientOwner = async (id: string) =>
      (await ctx.db.select().from(clients).where(eq(clients.id, id)))[0]
        ?.assignedUserId;
    expect(await leadOwner(leadA.id)).toBeNull();
    expect(await clientOwner(clientA.id)).toBeNull();
    expect(await leadOwner(leadB.id)).toBe(member);
  });
});
