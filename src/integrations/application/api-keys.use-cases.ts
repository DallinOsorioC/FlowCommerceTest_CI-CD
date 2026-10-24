import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../authorization/application/services/authorization.service';
import { NotFoundException } from '../../common/exceptions/domain.exceptions';
import {
  ALL_API_KEY_SCOPES,
  API_KEYS_REPOSITORY,
  generateApiKey,
  type ApiKeyScope,
  type ApiKeysRepository,
  type ApiKeyView,
} from '../domain/api-key';

// Gestión de API keys: solo OWNER y ADMIN (PROJECT_UPDATE). La clave completa
// se devuelve UNA vez, al crearla; después solo se ve el prefijo.

@Injectable()
export class CreateApiKeyUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(API_KEYS_REPOSITORY)
    private readonly repository: ApiKeysRepository,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
    name: string;
    // Sin scopes = todos (compatibilidad con quien no los conoce).
    scopes?: ApiKeyScope[];
  }): Promise<{ apiKey: ApiKeyView; key: string }> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PROJECT_UPDATE,
      input.projectId,
    );
    const generated = generateApiKey();
    const apiKey = await this.repository.create({
      projectId: input.projectId,
      name: input.name,
      prefix: generated.prefix,
      keyHash: generated.hash,
      scopes: [...new Set(input.scopes ?? ALL_API_KEY_SCOPES)],
      createdByUserId: input.actorUserId,
    });
    return { apiKey, key: generated.key };
  }
}

@Injectable()
export class ListApiKeysUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(API_KEYS_REPOSITORY)
    private readonly repository: ApiKeysRepository,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<ApiKeyView[]> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PROJECT_UPDATE,
      input.projectId,
    );
    return this.repository.listByProject(input.projectId);
  }
}

@Injectable()
export class RevokeApiKeyUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(API_KEYS_REPOSITORY)
    private readonly repository: ApiKeysRepository,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
    keyId: string;
  }): Promise<void> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PROJECT_UPDATE,
      input.projectId,
    );
    const revoked = await this.repository.revokeInProject(
      input.keyId,
      input.projectId,
      new Date(),
    );
    if (!revoked) {
      throw new NotFoundException('API key not found or already revoked');
    }
  }
}
