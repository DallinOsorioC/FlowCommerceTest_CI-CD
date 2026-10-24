import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { SecretCipher } from '../../../common/crypto/secret-cipher';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import {
  WHATSAPP_ACCOUNTS_REPOSITORY,
  type WhatsAppAccountsRepository,
} from '../../domain/ports/whatsapp-accounts.repository';
import {
  WHATSAPP_GATEWAY,
  type WhatsAppGateway,
} from '../../domain/ports/whatsapp.gateway';

// Lo que la UI ve de la conexión: nunca el token, solo sus últimos 4 dígitos.
export interface WhatsAppConfigView {
  connected: boolean;
  // 'project' = cuenta guardada del proyecto; 'environment' = variables WHATSAPP_*.
  source: 'project' | 'environment' | 'none';
  phoneNumberId: string | null;
  businessAccountId: string | null;
  tokenLast4: string | null;
  updatedAt: Date | null;
}

@Injectable()
export class GetWhatsAppConfigUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(WHATSAPP_ACCOUNTS_REPOSITORY)
    private readonly accounts: WhatsAppAccountsRepository,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<WhatsAppConfigView> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PROJECT_UPDATE,
      input.projectId,
    );
    const account = await this.accounts.findByProject(input.projectId);
    if (!account) {
      return {
        connected: false,
        source: 'none',
        phoneNumberId: null,
        businessAccountId: null,
        tokenLast4: null,
        updatedAt: null,
      };
    }
    return {
      connected: true,
      source: 'project',
      phoneNumberId: account.phoneNumberId,
      businessAccountId: account.businessAccountId,
      tokenLast4: account.tokenLast4,
      updatedAt: account.updatedAt,
    };
  }
}

@Injectable()
export class SaveWhatsAppConfigUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly cipher: SecretCipher,
    private readonly configService: ConfigService,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsappGateway: WhatsAppGateway,
    @Inject(WHATSAPP_ACCOUNTS_REPOSITORY)
    private readonly accounts: WhatsAppAccountsRepository,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
    phoneNumberId: string;
    businessAccountId: string | null;
    token: string;
  }): Promise<WhatsAppConfigView> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PROJECT_UPDATE,
      input.projectId,
    );
    const token = input.token.trim();
    const phoneNumberId = input.phoneNumberId.trim();

    // El número del entorno ya pertenece a WHATSAPP_PROJECT_ID.
    const envPhone = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const envProject = this.configService.get<string>('WHATSAPP_PROJECT_ID');
    if (envPhone === phoneNumberId && envProject !== input.projectId) {
      throw new ConflictException(
        'This WhatsApp phone number is already linked to another project',
      );
    }

    // Que Meta confirme que el token tiene acceso al número. Evita registrar
    // el número de otro y recibir sus mensajes entrantes.
    try {
      await this.whatsappGateway.verifyCredentials({ token, phoneNumberId });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new BadRequestException(
          `Meta rejected these WhatsApp credentials: ${String(
            (error.getResponse() as { message?: string }).message ?? '',
          )}`,
        );
      }
      throw error;
    }

    const saved = await this.accounts.upsert({
      projectId: input.projectId,
      phoneNumberId,
      businessAccountId: input.businessAccountId?.trim() || null,
      tokenEncrypted: this.cipher.encrypt(token),
      tokenLast4: token.slice(-4),
      updatedByUserId: input.actorUserId,
    });
    return {
      connected: true,
      source: 'project',
      phoneNumberId: saved.phoneNumberId,
      businessAccountId: saved.businessAccountId,
      tokenLast4: saved.tokenLast4,
      updatedAt: saved.updatedAt,
    };
  }
}

@Injectable()
export class DeleteWhatsAppConfigUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(WHATSAPP_ACCOUNTS_REPOSITORY)
    private readonly accounts: WhatsAppAccountsRepository,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<void> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PROJECT_UPDATE,
      input.projectId,
    );
    const deleted = await this.accounts.deleteByProject(input.projectId);
    if (!deleted) {
      throw new NotFoundException('This project has no WhatsApp account saved');
    }
  }
}
