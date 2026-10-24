import { NotificationType, Role } from '@flowcommerce/types';
import { NotificationPublisher } from './notification-publisher';

describe('NotificationPublisher', () => {
  const repository = {
    createMany: jest.fn(),
    findMemberIdsByRoles: jest.fn(),
    filterMembers: jest.fn(),
  };
  const publisher = new NotificationPublisher(repository as never);
  const projectId = 'p1';

  beforeEach(() => {
    jest.resetAllMocks();
    repository.createMany.mockImplementation((items: unknown[]) =>
      Promise.resolve(items.length),
    );
  });

  it('merges direct users and roles, without duplicates nor the actor', async () => {
    repository.filterMembers.mockResolvedValue(['u1', 'actor']);
    repository.findMemberIdsByRoles.mockResolvedValue(['u1', 'u2']);

    const created = await publisher.notify({
      projectId,
      type: NotificationType.QUOTE_PENDING_APPROVAL,
      title: 'Cotización pendiente',
      recipients: { userIds: ['u1', 'actor', null], roles: [Role.OWNER] },
      excludeUserId: 'actor',
      dedupeKey: 'k',
    });

    expect(created).toBe(2);
    expect(repository.filterMembers).toHaveBeenCalledWith(projectId, [
      'u1',
      'actor',
    ]);
    const [items] = repository.createMany.mock.calls[0] as [
      { userId: string; dedupeKey: string }[],
    ];
    expect(items.map((item) => item.userId).sort()).toEqual(['u1', 'u2']);
    expect(items[0].dedupeKey).toBe('k');
  });

  it('never throws: a failure is only logged', async () => {
    repository.findMemberIdsByRoles.mockRejectedValue(new Error('db down'));

    await expect(
      publisher.notify({
        projectId,
        type: NotificationType.ACCESS_REQUESTED,
        title: 'x',
        recipients: { roles: [Role.OWNER] },
      }),
    ).resolves.toBe(0);
  });

  it('does nothing when nobody is left to notify', async () => {
    repository.filterMembers.mockResolvedValue(['actor']);

    await publisher.notify({
      projectId,
      type: NotificationType.LEAD_ASSIGNED,
      title: 'x',
      recipients: { userIds: ['actor'] },
      excludeUserId: 'actor',
    });

    expect(repository.createMany).not.toHaveBeenCalled();
  });
});
