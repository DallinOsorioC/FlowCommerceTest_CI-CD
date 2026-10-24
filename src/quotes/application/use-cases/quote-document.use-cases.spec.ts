import { Permission, QuoteStatus } from '@flowcommerce/types';
import {
  BadRequestException,
  ConflictException,
} from '../../../common/exceptions/domain.exceptions';
import type { QuoteDocument } from '../../domain/quote-document';
import { SendQuoteUseCase } from './quote-document.use-cases';

describe('SendQuoteUseCase', () => {
  const authorizationService = { assertCan: jest.fn() };
  const quoteRepository = { findByIdInProject: jest.fn() };
  const documentBuilder = { build: jest.fn() };
  const renderer = { render: jest.fn() };
  const emailSender = { send: jest.fn() };
  const updateQuoteStatus = { execute: jest.fn() };
  const activity = { record: jest.fn() };
  const useCase = new SendQuoteUseCase(
    authorizationService as never,
    quoteRepository as never,
    documentBuilder as never,
    renderer,
    emailSender,
    updateQuoteStatus as never,
    activity as never,
  );

  const base = { actorUserId: 'actor', projectId: 'p1', quoteId: 'q1' };
  const document = (email: string | null) =>
    ({
      folio: 'COT-000007',
      total: 1120,
      currency: 'GTQ',
      validUntil: null,
      company: { name: 'FlowCommerce', legalName: 'Flow S.A.' },
      customer: { name: 'Ana', email },
      advisor: { name: 'Diego', email: 'diego@flow.test' },
    }) as unknown as QuoteDocument;

  beforeEach(() => {
    jest.resetAllMocks();
    authorizationService.assertCan.mockResolvedValue(undefined);
    renderer.render.mockResolvedValue(Buffer.from('%PDF-1.3'));
  });

  it('emails the PDF to the customer and moves APPROVED to SENT', async () => {
    quoteRepository.findByIdInProject.mockResolvedValue({
      folio: 'COT-000007',
      status: QuoteStatus.APPROVED,
    });
    documentBuilder.build.mockResolvedValue(document('ana@cliente.test'));
    updateQuoteStatus.execute.mockResolvedValue({ status: QuoteStatus.SENT });

    const result = await useCase.execute(base);

    expect(authorizationService.assertCan).toHaveBeenCalledWith(
      'actor',
      Permission.QUOTE_CREATE,
      'p1',
    );
    expect(emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@cliente.test',
        replyTo: 'diego@flow.test',
        attachments: [
          expect.objectContaining({
            filename: 'COT-000007.pdf',
            contentType: 'application/pdf',
          }),
        ],
      }),
    );
    expect(updateQuoteStatus.execute).toHaveBeenCalledWith({
      ...base,
      status: QuoteStatus.SENT,
    });
    expect(result.status).toBe(QuoteStatus.SENT);
  });

  it('re-sends a SENT quote without changing its status', async () => {
    quoteRepository.findByIdInProject.mockResolvedValue({
      folio: 'COT-000007',
      status: QuoteStatus.SENT,
    });
    documentBuilder.build.mockResolvedValue(document(null));

    await useCase.execute({ ...base, to: 'otro@cliente.test' });

    expect(emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'otro@cliente.test' }),
    );
    expect(updateQuoteStatus.execute).not.toHaveBeenCalled();
  });

  it('refuses a quote that is not approved yet (409)', async () => {
    quoteRepository.findByIdInProject.mockResolvedValue({
      status: QuoteStatus.DRAFT,
    });

    await expect(useCase.execute(base)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('asks for a recipient when the customer has no email (400)', async () => {
    quoteRepository.findByIdInProject.mockResolvedValue({
      status: QuoteStatus.APPROVED,
    });
    documentBuilder.build.mockResolvedValue(document(null));

    await expect(useCase.execute(base)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('keeps the quote APPROVED when the email fails', async () => {
    quoteRepository.findByIdInProject.mockResolvedValue({
      folio: 'COT-000007',
      status: QuoteStatus.APPROVED,
    });
    documentBuilder.build.mockResolvedValue(document('ana@cliente.test'));
    emailSender.send.mockRejectedValue(new Error('Resend down'));

    await expect(useCase.execute(base)).rejects.toThrow('Resend down');
    expect(updateQuoteStatus.execute).not.toHaveBeenCalled();
  });
});
