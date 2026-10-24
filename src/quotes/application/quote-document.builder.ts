import { Inject, Injectable } from '@nestjs/common';
import {
  CLIENTS_REPOSITORY,
  type ClientRepository,
} from '../../clients/domain/repositories/client.repository';
import { NotFoundException } from '../../common/exceptions/domain.exceptions';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../leads/domain/repositories/lead.repository';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../projects/domain/repositories/project.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/repositories/user.repository';
import type { QuoteEntity } from '../domain/entities/quote.entity';
import type { QuoteDocument } from '../domain/quote-document';

// Reúne los datos del documento de una cotización: la empresa (perfil de
// facturación del proyecto), el cliente (o el lead si no tiene cliente), el
// asesor (quien la creó) y la cotización con sus partidas. Todas las lecturas
// van acotadas al proyecto de la cotización.
@Injectable()
export class QuoteDocumentBuilder {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
    @Inject(CLIENTS_REPOSITORY)
    private readonly clientRepository: ClientRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async build(quote: QuoteEntity): Promise<QuoteDocument> {
    const [project, lead, client, advisor] = await Promise.all([
      this.projectRepository.findById(quote.projectId),
      this.leadRepository.findByIdInProject(quote.leadId, quote.projectId),
      quote.clientId
        ? this.clientRepository.findByIdInProject(
            quote.clientId,
            quote.projectId,
          )
        : Promise.resolve(null),
      quote.createdByUserId
        ? this.userRepository.findById(quote.createdByUserId)
        : Promise.resolve(null),
    ]);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const customer = client
      ? {
          name: client.name,
          company: client.company,
          taxId: client.taxId,
          email: client.email,
          phone: client.phone,
          contactPosition: client.contactPosition,
        }
      : {
          name: lead?.name ?? 'Cliente',
          company: lead?.company ?? null,
          taxId: null,
          email: lead?.email ?? null,
          phone: lead?.phone ?? null,
          contactPosition: lead?.contactPosition ?? null,
        };

    return {
      folio: quote.folio,
      status: quote.status,
      issuedAt: quote.creadoEn,
      validUntil: quote.validUntil,
      currency: project.quoteSettings.currency,
      company: { name: project.name, ...project.billing },
      customer,
      advisor: advisor
        ? {
            name: advisor.name,
            email: advisor.email,
            phone: advisor.phone,
            position: advisor.position,
          }
        : null,
      items: quote.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        lineTotal: item.lineTotal,
      })),
      subtotal: quote.subtotal,
      discount: quote.discount,
      adjustment: quote.adjustment,
      taxPercent: quote.taxPercent,
      tax: quote.tax,
      total: quote.total,
      notes: quote.notes,
      terms: quote.terms,
      origin: quote.origin,
      paymentLinkUrl: quote.paymentLinkUrl,
    };
  }
}
