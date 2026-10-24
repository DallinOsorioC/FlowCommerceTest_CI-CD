import { NotificationCategory, NotificationType } from '@flowcommerce/types';
import type { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import type { NotificationsRepository } from '../../domain/notifications.repository';
import { ListNotificationsUseCase } from './notifications.use-cases';

describe('ListNotificationsUseCase (category tabs)', () => {
  const authorizationService = {
    assertCan: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuthorizationService>;
  const repository = {
    listForUser: jest.fn().mockResolvedValue({ notifications: [], total: 0 }),
    countUnread: jest.fn().mockResolvedValue(0),
  } as unknown as jest.Mocked<NotificationsRepository>;
  const useCase = new ListNotificationsUseCase(
    authorizationService,
    repository,
  );
  const base = { actorUserId: 'u1', projectId: 'p1', page: 1, limit: 20 };

  const typesSent = () => repository.listForUser.mock.calls[0][2].types;

  beforeEach(() => jest.clearAllMocks());

  it('does not filter by type when neither type nor category is given', async () => {
    await useCase.execute(base);
    expect(typesSent()).toBeUndefined();
  });

  it('expands a category into all its types', async () => {
    await useCase.execute({ ...base, category: NotificationCategory.QUOTE });

    expect(typesSent()).toEqual(
      expect.arrayContaining([
        NotificationType.QUOTE_PENDING_APPROVAL,
        NotificationType.QUOTE_PAID,
        NotificationType.QUOTE_EXPIRED,
      ]),
    );
    expect(typesSent()).not.toContain(NotificationType.MESSAGE_RECEIVED);
  });

  it('puts stale leads in the Leads tab', async () => {
    await useCase.execute({ ...base, category: NotificationCategory.LEAD });
    expect(typesSent()).toContain(NotificationType.LEAD_STALE);
  });

  it('narrows a category with a type that belongs to it', async () => {
    await useCase.execute({
      ...base,
      category: NotificationCategory.QUOTE,
      type: NotificationType.QUOTE_PAID,
    });
    expect(typesSent()).toEqual([NotificationType.QUOTE_PAID]);
  });

  it('returns nothing for an impossible combination', async () => {
    await useCase.execute({
      ...base,
      category: NotificationCategory.QUOTE,
      type: NotificationType.MESSAGE_RECEIVED,
    });
    expect(typesSent()).toEqual([]);
  });
});
