import type { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '../../common/exceptions/domain.exceptions';
import type { QuoteLifecycleEvents } from '../../quotes/application/quote-lifecycle.events';
import { signPaymentPayload } from '../domain/payments';
import { HandlePaymentWebhookUseCase } from './payments.use-cases';

describe('HandlePaymentWebhookUseCase', () => {
  const secret = 'whsec_test';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const quoteId = '55555555-5555-4555-8555-555555555555';

  const quote = (status: string) => ({
    id: quoteId,
    projectId,
    folio: 'COT-0001',
    status,
    total: 1008,
  });
  const quoteRepository = {
    findByIdInProject: jest.fn(),
    transitionStatusInProject: jest.fn(),
    setPaymentLinkInProject: jest.fn(),
  };
  const projectRepository = { findById: jest.fn() };
  const events = { exists: jest.fn(), record: jest.fn() };
  const lifecycle = { transitioned: jest.fn() };

  const useCase = new HandlePaymentWebhookUseCase(
    { get: () => secret } as unknown as ConfigService,
    quoteRepository as never,
    projectRepository as never,
    events,
    lifecycle as unknown as QuoteLifecycleEvents,
  );

  const send = (payload: object, signWith = secret) => {
    const rawBody = Buffer.from(JSON.stringify(payload));
    return useCase.execute({
      rawBody,
      signatureHeader: signPaymentPayload(
        rawBody,
        signWith,
        Math.floor(Date.now() / 1000),
      ),
      payload,
    });
  };
  const paid = {
    eventId: 'evt_1',
    type: 'payment.succeeded',
    projectId,
    quoteId,
    amount: 1008,
    currency: 'GTQ',
    reference: 'pi_123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    events.exists.mockResolvedValue(false);
    events.record.mockResolvedValue(undefined);
    projectRepository.findById.mockResolvedValue({
      quoteSettings: { currency: 'GTQ' },
    });
    quoteRepository.findByIdInProject.mockResolvedValue(quote('ACCEPTED'));
    quoteRepository.transitionStatusInProject.mockResolvedValue(quote('PAID'));
  });

  it('marks an ACCEPTED quote as PAID and records the event once', async () => {
    await expect(send(paid)).resolves.toBe('PROCESSED');

    expect(quoteRepository.findByIdInProject).toHaveBeenCalledWith(
      quoteId,
      projectId,
    );
    expect(quoteRepository.transitionStatusInProject).toHaveBeenCalledWith(
      quoteId,
      projectId,
      expect.objectContaining({
        from: 'ACCEPTED',
        to: 'PAID',
        paymentReference: 'pi_123',
      }),
    );
    expect(lifecycle.transitioned).toHaveBeenCalledWith(
      quote('PAID'),
      'ACCEPTED',
      null,
    );
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt_1', result: 'PROCESSED' }),
    );
  });

  it('rejects a signature made with another secret (403) without reading data', async () => {
    await expect(send(paid, 'wrong')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(quoteRepository.findByIdInProject).not.toHaveBeenCalled();
  });

  it('answers DUPLICATE for an event that was already processed', async () => {
    events.exists.mockResolvedValue(true);

    await expect(send(paid)).resolves.toBe('DUPLICATE');
    expect(quoteRepository.transitionStatusInProject).not.toHaveBeenCalled();
  });

  it('refuses a payment whose amount does not match the total (409)', async () => {
    await expect(send({ ...paid, amount: 1000 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(quoteRepository.transitionStatusInProject).not.toHaveBeenCalled();
    expect(events.record).not.toHaveBeenCalled();
  });

  it('refuses to pay a quote that was not accepted (409)', async () => {
    quoteRepository.findByIdInProject.mockResolvedValue(quote('SENT'));

    await expect(send(paid)).rejects.toBeInstanceOf(ConflictException);
    expect(quoteRepository.transitionStatusInProject).not.toHaveBeenCalled();
  });

  it('records a failed payment without changing the quote', async () => {
    await expect(send({ ...paid, type: 'payment.failed' })).resolves.toBe(
      'IGNORED',
    );
    expect(quoteRepository.transitionStatusInProject).not.toHaveBeenCalled();
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payment.failed', result: 'IGNORED' }),
    );
  });

  it('answers 400 for a signed event without the required fields', async () => {
    await expect(send({ eventId: 'evt_2' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
