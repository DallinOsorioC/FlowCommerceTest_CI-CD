import { NotificationType, Role } from '@flowcommerce/types';
import { RunRemindersUseCase } from './run-reminders.use-case';

describe('RunRemindersUseCase', () => {
  const reader = {
    findDueFollowUps: jest.fn(),
    findExpiredSentQuotes: jest.fn(),
    findStaleLeads: jest.fn(),
  };
  const publisher = { notify: jest.fn() };
  const useCase = new RunRemindersUseCase(reader, publisher as never);
  const now = new Date('2026-10-20T15:00:00.000Z');

  beforeEach(() => {
    jest.resetAllMocks();
    publisher.notify.mockResolvedValue(1);
    reader.findStaleLeads.mockResolvedValue([]);
  });

  it('notifies due follow-ups and expired quotes with a dedupe key each', async () => {
    reader.findDueFollowUps.mockResolvedValue([
      {
        id: 'f1',
        projectId: 'p1',
        leadId: 'l1',
        leadName: 'Ana',
        title: 'Llamar',
        dueAt: now,
        assignedUserId: null,
        createdByUserId: 'creator',
      },
    ]);
    reader.findExpiredSentQuotes.mockResolvedValue([
      {
        id: 'q1',
        projectId: 'p1',
        folio: 'COT-000001',
        validUntil: new Date('2026-10-01T00:00:00.000Z'),
        createdByUserId: 'seller',
      },
    ]);

    await expect(useCase.execute(now)).resolves.toEqual({
      followUps: 1,
      quotes: 1,
      staleLeads: 0,
    });

    expect(reader.findDueFollowUps).toHaveBeenCalledWith(now, 500);
    expect(publisher.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.FOLLOW_UP_DUE,
        // Sin responsable: se avisa a quien lo creó.
        recipients: { userIds: ['creator'] },
        dedupeKey: 'follow-up-due:f1',
      }),
    );
    expect(publisher.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.QUOTE_EXPIRED,
        recipients: { userIds: ['seller'], roles: [Role.OWNER, Role.ADMIN] },
        dedupeKey: 'quote-expired:q1',
      }),
    );
  });

  describe('stale leads', () => {
    const lastContact = new Date('2026-10-10T12:00:00.000Z');

    beforeEach(() => {
      reader.findDueFollowUps.mockResolvedValue([]);
      reader.findExpiredSentQuotes.mockResolvedValue([]);
    });

    it('asks for leads untouched for 7 days', async () => {
      await useCase.execute(now);

      expect(reader.findStaleLeads).toHaveBeenCalledWith(
        new Date('2026-10-13T15:00:00.000Z'),
        500,
      );
    });

    it('notifies the owner of the lead, deduped per last-contact day', async () => {
      reader.findStaleLeads.mockResolvedValue([
        {
          id: 'l1',
          projectId: 'p1',
          name: 'Gabriela Pérez',
          assignedUserId: 'advisor',
          lastActivityAt: lastContact,
        },
      ]);

      const result = await useCase.execute(now);

      expect(result.staleLeads).toBe(1);
      expect(publisher.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.LEAD_STALE,
          recipients: { userIds: ['advisor'] },
          dedupeKey: 'lead-stale:l1:2026-10-10',
        }),
      );
    });

    it('falls back to OWNER and ADMIN when the lead has no owner', async () => {
      reader.findStaleLeads.mockResolvedValue([
        {
          id: 'l2',
          projectId: 'p1',
          name: 'Sin responsable',
          assignedUserId: null,
          lastActivityAt: lastContact,
        },
      ]);

      await useCase.execute(now);

      expect(publisher.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: { roles: [Role.OWNER, Role.ADMIN] },
        }),
      );
    });
  });
});
