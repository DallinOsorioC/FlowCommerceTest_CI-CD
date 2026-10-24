import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityType, Permission } from '@flowcommerce/types';
import { ActivityRecorder } from '../../activity/application/activity-recorder';
import { AuthorizationService } from '../../authorization/application/services/authorization.service';
import {
  CLIENTS_REPOSITORY,
  type ClientRepository,
} from '../../clients/domain/repositories/client.repository';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/domain.exceptions';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../leads/domain/repositories/lead.repository';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../projects/domain/repositories/project.repository';
import { QuoteLifecycleEvents } from '../../quotes/application/quote-lifecycle.events';
import type { QuoteEntity } from '../../quotes/domain/entities/quote.entity';
import {
  QUOTES_REPOSITORY,
  type QuoteRepository,
} from '../../quotes/domain/repositories/quote.repository';
import {
  PAYMENT_EVENTS_REPOSITORY,
  PAYMENTS_GATEWAY,
  parsePaymentEvent,
  sameAmount,
  verifyPaymentSignature,
  type PaymentEventsRepository,
  type PaymentsGateway,
  type PaymentWebhookEvent,
} from '../domain/payments';

// Link de pago de una cotización ACEPTADA. Lo crea el servicio de Pagos; el
// CRM solo lo pide y lo guarda para mostrarlo (y enviarlo por WhatsApp o
// correo). Si ya existe, se devuelve el mismo.
@Injectable()
export class CreatePaymentLinkUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(QUOTES_REPOSITORY)
    private readonly quoteRepository: QuoteRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    @Inject(CLIENTS_REPOSITORY)
    private readonly clientRepository: ClientRepository,
    @Inject(PAYMENTS_GATEWAY)
    private readonly paymentsGateway: PaymentsGateway,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
    quoteId: string;
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
    if (quote.status !== 'ACCEPTED') {
      throw new ConflictException(
        `Only ACCEPTED quotes can be paid (current status: ${quote.status})`,
      );
    }
    if (quote.paymentLinkUrl) {
      return quote;
    }

    const [project, client, lead] = await Promise.all([
      this.projectRepository.findById(input.projectId),
      quote.clientId
        ? this.clientRepository.findByIdInProject(
            quote.clientId,
            input.projectId,
          )
        : Promise.resolve(null),
      this.leadRepository.findByIdInProject(quote.leadId, input.projectId),
    ]);
    const customer = client
      ? { name: client.company ?? client.name, email: client.email }
      : { name: lead?.name ?? 'Cliente', email: lead?.email ?? null };

    const link = await this.paymentsGateway.createPaymentLink({
      projectId: input.projectId,
      quoteId: quote.id,
      folio: quote.folio,
      amount: quote.total,
      currency: project?.quoteSettings.currency ?? 'GTQ',
      description: `Cotización ${quote.folio}${project ? ` — ${project.name}` : ''}`,
      customer,
    });

    const updated = await this.quoteRepository.setPaymentLinkInProject(
      quote.id,
      input.projectId,
      link.url,
    );
    if (!updated) {
      throw new ConflictException('Quote status changed; reload and retry');
    }
    await this.activity.record({
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      type: ActivityType.QUOTE_PAYMENT_LINK_CREATED,
      title: `Link de pago creado para ${quote.folio}`,
      leadId: quote.leadId,
      clientId: quote.clientId,
      quoteId: quote.id,
      metadata: { providerReference: link.providerReference },
    });
    return updated;
  }
}

export type PaymentWebhookOutcome = 'PROCESSED' | 'IGNORED' | 'DUPLICATE';

// Webhook del servicio de Pagos. Público (sin sesión): la prueba de identidad
// es la firma HMAC con PAYMENTS_WEBHOOK_SECRET. Idempotente por eventId.
//
//   payment.succeeded    → la cotización ACCEPTED pasa a PAID (con la
//                          referencia del pago), avisa al asesor y queda en
//                          la actividad. El importe debe coincidir con el total.
//   payment.failed       → se registra; la cotización no cambia.
//   payment_link.created → guarda el link si Pagos lo creó por su cuenta.
@Injectable()
export class HandlePaymentWebhookUseCase {
  private readonly logger = new Logger(HandlePaymentWebhookUseCase.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(QUOTES_REPOSITORY)
    private readonly quoteRepository: QuoteRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(PAYMENT_EVENTS_REPOSITORY)
    private readonly events: PaymentEventsRepository,
    private readonly lifecycle: QuoteLifecycleEvents,
  ) {}

  async execute(input: {
    rawBody: Buffer | undefined;
    signatureHeader: string | undefined;
    payload: unknown;
  }): Promise<PaymentWebhookOutcome> {
    const secret = this.configService.get<string>('PAYMENTS_WEBHOOK_SECRET');
    if (!secret) {
      throw new ForbiddenException('Payments webhook is not configured');
    }
    if (
      !input.rawBody ||
      !verifyPaymentSignature(
        input.rawBody,
        input.signatureHeader,
        secret,
        Math.floor(Date.now() / 1000),
      )
    ) {
      throw new ForbiddenException('Invalid payments webhook signature');
    }

    const event = parsePaymentEvent(input.payload);
    if (!event) {
      throw new BadRequestException(
        'Invalid payment event: eventId, type, projectId and quoteId are required',
      );
    }
    if (await this.events.exists(event.eventId)) {
      return 'DUPLICATE';
    }

    const quote = await this.quoteRepository.findByIdInProject(
      event.quoteId,
      event.projectId,
    );
    if (!quote) {
      throw new NotFoundException('Quote not found in this project');
    }

    const result =
      event.type === 'payment.succeeded'
        ? await this.applyPayment(event, quote)
        : event.type === 'payment_link.created'
          ? await this.applyLink(event, quote)
          : 'IGNORED';

    await this.events.record({
      projectId: event.projectId,
      quoteId: event.quoteId,
      eventId: event.eventId,
      type: event.type,
      amount: event.amount,
      currency: event.currency,
      reference: event.reference,
      result,
    });
    return result;
  }

  private async applyPayment(
    event: PaymentWebhookEvent,
    quote: QuoteEntity,
  ): Promise<'PROCESSED' | 'IGNORED'> {
    if (quote.status === 'PAID') {
      return 'IGNORED';
    }
    if (quote.status !== 'ACCEPTED') {
      // No se registra el evento: Pagos puede reintentarlo cuando se corrija.
      throw new ConflictException(
        `Quote ${quote.folio} is ${quote.status}; only ACCEPTED quotes can be paid`,
      );
    }
    if (event.amount === null || !sameAmount(event.amount, quote.total)) {
      throw new ConflictException(
        `Paid amount ${event.amount ?? 'missing'} does not match the quote total ${quote.total}`,
      );
    }
    const project = await this.projectRepository.findById(event.projectId);
    const currency = project?.quoteSettings.currency;
    if (event.currency && currency && event.currency !== currency) {
      throw new ConflictException(
        `Paid currency ${event.currency} does not match the project currency ${currency}`,
      );
    }

    const updated = await this.quoteRepository.transitionStatusInProject(
      quote.id,
      event.projectId,
      {
        from: 'ACCEPTED',
        to: 'PAID',
        at: new Date(),
        paymentReference: event.reference,
      },
    );
    if (!updated) {
      throw new ConflictException('Quote status changed concurrently; retry');
    }
    this.logger.log(`Quote ${quote.folio} paid (event ${event.eventId})`);
    await this.lifecycle.transitioned(updated, 'ACCEPTED', null);
    return 'PROCESSED';
  }

  private async applyLink(
    event: PaymentWebhookEvent,
    quote: QuoteEntity,
  ): Promise<'PROCESSED' | 'IGNORED'> {
    if (!event.paymentLinkUrl || quote.status !== 'ACCEPTED') {
      return 'IGNORED';
    }
    const updated = await this.quoteRepository.setPaymentLinkInProject(
      quote.id,
      event.projectId,
      event.paymentLinkUrl,
    );
    return updated ? 'PROCESSED' : 'IGNORED';
  }
}
