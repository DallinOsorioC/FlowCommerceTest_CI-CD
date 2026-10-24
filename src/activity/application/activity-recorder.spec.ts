import { ActivityType } from '@flowcommerce/types';
import { ActivityRecorder } from './activity-recorder';

describe('ActivityRecorder', () => {
  const repository = {
    insert: jest.fn(),
    list: jest.fn(),
  };
  const recorder = new ActivityRecorder(repository);

  beforeEach(() => jest.clearAllMocks());

  it('stores the event and trims the title to the column size', async () => {
    repository.insert.mockResolvedValue(undefined);

    await recorder.record({
      projectId: 'p1',
      type: ActivityType.LEAD_CREATED,
      title: 'x'.repeat(300),
      leadId: 'l1',
    });

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        type: ActivityType.LEAD_CREATED,
        leadId: 'l1',
        title: 'x'.repeat(255),
      }),
    );
  });

  it('never throws: a failure only goes to the log', async () => {
    repository.insert.mockRejectedValue(new Error('db down'));

    await expect(
      recorder.record({
        projectId: 'p1',
        type: ActivityType.LEAD_CREATED,
        title: 'Lead creado',
      }),
    ).resolves.toBeUndefined();
  });

  describe('activity sink (webhooks)', () => {
    const input = {
      projectId: 'p1',
      type: ActivityType.LEAD_CREATED,
      title: 'Lead creado',
      leadId: 'l1',
    };

    it('notifies the sink after the event is stored', async () => {
      repository.insert.mockResolvedValue(undefined);
      const sink = { onActivity: jest.fn() };

      await new ActivityRecorder(repository, sink).record(input);

      expect(sink.onActivity).toHaveBeenCalledWith(
        expect.objectContaining({ type: ActivityType.LEAD_CREATED }),
      );
    });

    it('does not notify when the event could not be stored', async () => {
      repository.insert.mockRejectedValue(new Error('db down'));
      const sink = { onActivity: jest.fn() };

      await new ActivityRecorder(repository, sink).record(input);

      expect(sink.onActivity).not.toHaveBeenCalled();
    });

    it('survives a sink that throws', async () => {
      repository.insert.mockResolvedValue(undefined);
      const sink = {
        onActivity: jest.fn(() => {
          throw new Error('boom');
        }),
      };

      await expect(
        new ActivityRecorder(repository, sink).record(input),
      ).resolves.toBeUndefined();
    });
  });
});
