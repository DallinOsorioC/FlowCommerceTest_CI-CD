import { Inject, Injectable } from '@nestjs/common';
import { ActivityType, Permission, QuoteStatus } from '@flowcommerce/types';
import { ActivityRecorder } from '../../../activity/application/activity-recorder';
import {
  EMAIL_SENDER,
  type EmailSender,
} from '../../../auth/application/ports/email-sender';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import type { QuoteEntity } from '../../domain/entities/quote.entity';
import {
  formatDate,
  formatMoney,
  quoteFilename,
  type QuoteDocument,
} from '../../domain/quote-document';
import {
  QUOTES_REPOSITORY,
  type QuoteRepository,
} from '../../domain/repositories/quote.repository';
import {
  QUOTE_PDF_RENDERER,
  type QuotePdfRenderer,
} from '../ports/quote-pdf.renderer';
import { QuoteDocumentBuilder } from '../quote-document.builder';
import { UpdateQuoteStatusUseCase } from './update-quote-status.use-case';

export interface QuotePdf {
  filename: string;
  content: Buffer;
}

// Se puede enviar al cliente una cotización ya aprobada (APPROVED, la primera
// vez) o reenviarla si ya está SENT.
const SENDABLE: readonly QuoteStatus[] = [
  QuoteStatus.APPROVED,
  QuoteStatus.SENT,
];

@Injectable()
export class GetQuotePdfUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(QUOTES_REPOSITORY)
    private readonly quoteRepository: QuoteRepository,
    private readonly documentBuilder: QuoteDocumentBuilder,
    @Inject(QUOTE_PDF_RENDERER)
    private readonly renderer: QuotePdfRenderer,
  ) {}

  // Vista previa / descarga del PDF (QUOTE_READ: VIEWER también puede verlo).
  async execute(input: {
    actorUserId: string;
    projectId: string;
    quoteId: string;
  }): Promise<QuotePdf> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.QUOTE_READ,
      input.projectId,
    );
    const quote = await this.quoteRepository.findByIdInProject(
      input.quoteId,
      input.projectId,
    );
    if (!quote) {
      throw new NotFoundException('Quote not found in this project');
    }
    const document = await this.documentBuilder.build(quote);
    return {
      filename: quoteFilename(quote.folio),
      content: await this.renderer.render(document),
    };
  }
}

@Injectable()
export class SendQuoteUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(QUOTES_REPOSITORY)
    private readonly quoteRepository: QuoteRepository,
    private readonly documentBuilder: QuoteDocumentBuilder,
    @Inject(QUOTE_PDF_RENDERER)
    private readonly renderer: QuotePdfRenderer,
    @Inject(EMAIL_SENDER)
    private readonly emailSender: EmailSender,
    private readonly updateQuoteStatus: UpdateQuoteStatusUseCase,
    private readonly activity: ActivityRecorder,
  ) {}

  // "Aprobar y enviar": manda la cotización por correo con el PDF adjunto y,
  // si estaba APPROVED, la pasa a SENT (mismo caso de uso que el cambio de
  // estado manual: permisos, transición atómica y notificaciones).
  //
  // Orden: primero el correo, después el estado. Si el correo falla, la
  // cotización sigue APPROVED y se puede reintentar.
  async execute(input: {
    actorUserId: string;
    projectId: string;
    quoteId: string;
    to?: string;
    cc?: string[];
    message?: string;
  }): Promise<QuoteEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.QUOTE_CREATE,
      input.projectId,
    );
    const quote = await this.quoteRepository.findByIdInProject(
      input.quoteId,
      input.projectId,
    );
    if (!quote) {
      throw new NotFoundException('Quote not found in this project');
    }
    if (!SENDABLE.includes(quote.status)) {
      throw new ConflictException(
        `Only APPROVED or SENT quotes can be emailed (current status: ${quote.status})`,
      );
    }

    const document = await this.documentBuilder.build(quote);
    const to = input.to ?? document.customer.email;
    if (!to) {
      throw new BadRequestException(
        'The customer has no email; send "to" with the recipient address',
      );
    }

    const pdf = await this.renderer.render(document);
    await this.emailSender.send({
      to,
      cc: input.cc,
      replyTo: document.advisor?.email,
      subject: `Cotización ${quote.folio} — ${document.company.legalName ?? document.company.name}`,
      text: this.text(document, input.message),
      html: this.html(document, input.message),
      attachments: [
        {
          filename: quoteFilename(quote.folio),
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    });
    await this.activity.record({
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      type: ActivityType.QUOTE_SENT_BY_EMAIL,
      title: `Cotización ${quote.folio} enviada por correo a ${to}`,
      leadId: quote.leadId,
      clientId: quote.clientId,
      quoteId: quote.id,
      metadata: { to, cc: input.cc ?? [] },
    });

    if (quote.status === QuoteStatus.APPROVED) {
      return this.updateQuoteStatus.execute({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        quoteId: input.quoteId,
        status: QuoteStatus.SENT,
      });
    }
    return quote;
  }

  private text(doc: QuoteDocument, message?: string): string {
    return [
      `Hola ${doc.customer.name},`,
      '',
      message ??
        `Te compartimos la cotización ${doc.folio} por ${formatMoney(doc.total, doc.currency)}.`,
      doc.validUntil ? `Vigente hasta el ${formatDate(doc.validUntil)}.` : '',
      '',
      'Encontrarás el detalle en el PDF adjunto.',
      '',
      doc.advisor
        ? `${doc.advisor.name} · ${doc.company.legalName ?? doc.company.name}`
        : (doc.company.legalName ?? doc.company.name),
    ]
      .filter((line, index, all) => line !== '' || all[index - 1] !== '')
      .join('\n');
  }

  private html(doc: QuoteDocument, message?: string): string {
    const escape = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return this.text(doc, message)
      .split('\n')
      .map((line) => (line ? `<p>${escape(line)}</p>` : ''))
      .join('');
  }
}
