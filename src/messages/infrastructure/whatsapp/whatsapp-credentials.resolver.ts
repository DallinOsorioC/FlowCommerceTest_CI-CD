import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretCipher } from '../../../common/crypto/secret-cipher';
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '../../../common/exceptions/domain.exceptions';
import {
  WHATSAPP_ACCOUNTS_REPOSITORY,
  type WhatsAppAccountsRepository,
} from '../../domain/ports/whatsapp-accounts.repository';

export interface WhatsAppCredentials {
  token: string;
  phoneNumberId: string;
  // Necesario para listar y crear plantillas; null si no está configurado.
  businessAccountId: string | null;
}

// Decide con qué credenciales habla un proyecto con WhatsApp:
//   1. La cuenta guardada del proyecto (token cifrado en BD).
//   2. Si no tiene, las variables WHATSAPP_* del entorno. Ahí
//      WHATSAPP_PROJECT_ID ata el número a un único proyecto, para que otro
//      tenant no hable por él.
// El webhook entrante sigue resolviéndose con el entorno (ver
// HandleWhatsAppWebhookUseCase): este resolver solo gobierna el ENVÍO.
@Injectable()
export class WhatsAppCredentialsResolver {
  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(WHATSAPP_ACCOUNTS_REPOSITORY)
    private readonly accounts?: WhatsAppAccountsRepository,
    @Optional() private readonly cipher?: SecretCipher,
  ) {}

  async resolve(projectId: string): Promise<WhatsAppCredentials> {
    const account = await this.accounts?.findByProject(projectId);
    if (account) {
      if (!this.cipher) {
        throw new ServiceUnavailableException('Secret cipher is not available');
      }
      return {
        token: this.cipher.decrypt(account.tokenEncrypted),
        phoneNumberId: account.phoneNumberId,
        businessAccountId: account.businessAccountId,
      };
    }
    return this.fromEnvironment(projectId);
  }

  private fromEnvironment(projectId: string): WhatsAppCredentials {
    const token = this.configService.get<string>('WHATSAPP_TOKEN');
    const phoneNumberId = this.configService.get<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    if (!token || !phoneNumberId) {
      throw new ServiceUnavailableException(
        'WhatsApp Cloud API is not configured',
      );
    }
    const boundProjectId = this.configService.get<string>(
      'WHATSAPP_PROJECT_ID',
    );
    if (boundProjectId && boundProjectId !== projectId) {
      throw new ForbiddenException(
        'WhatsApp is not configured for this project',
      );
    }
    return {
      token,
      phoneNumberId,
      businessAccountId:
        this.configService.get<string>('WHATSAPP_BUSINESS_ACCOUNT_ID') ?? null,
    };
  }
}
