import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../authorization/application/services/authorization.service';
import {
  BadRequestException,
  NotFoundException,
} from '../../common/exceptions/domain.exceptions';
import {
  QUICK_REPLIES_REPOSITORY,
  SHORTCUT_PATTERN,
  type QuickRepliesRepository,
  type QuickReply,
} from '../domain/quick-reply';

// Respuestas rápidas del chat. Las gestiona quien puede escribir por WhatsApp:
// son atajos de trabajo diario, no configuración del proyecto.

function normalizeShortcut(raw: string): string {
  const shortcut = raw.trim().replace(/^\//, '').toLowerCase();
  if (!SHORTCUT_PATTERN.test(shortcut)) {
    throw new BadRequestException(
      'shortcut must be 1-40 chars: lowercase letters, digits, "-" or "_"',
    );
  }
  return shortcut;
}

function requireContent(raw: string): string {
  const content = raw.trim();
  if (!content) {
    throw new BadRequestException('content must not be empty');
  }
  return content;
}

@Injectable()
export class QuickRepliesUseCases {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(QUICK_REPLIES_REPOSITORY)
    private readonly repository: QuickRepliesRepository,
  ) {}

  async list(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<QuickReply[]> {
    await this.assertCan(input.actorUserId, input.projectId);
    return this.repository.listByProject(input.projectId);
  }

  async create(input: {
    actorUserId: string;
    projectId: string;
    shortcut: string;
    title: string;
    content: string;
  }): Promise<QuickReply> {
    await this.assertCan(input.actorUserId, input.projectId);
    return this.repository.create({
      projectId: input.projectId,
      shortcut: normalizeShortcut(input.shortcut),
      title: input.title.trim(),
      content: requireContent(input.content),
      createdByUserId: input.actorUserId,
    });
  }

  async update(input: {
    actorUserId: string;
    projectId: string;
    id: string;
    shortcut?: string;
    title?: string;
    content?: string;
  }): Promise<QuickReply> {
    await this.assertCan(input.actorUserId, input.projectId);
    const patch = {
      ...(input.shortcut !== undefined && {
        shortcut: normalizeShortcut(input.shortcut),
      }),
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.content !== undefined && {
        content: requireContent(input.content),
      }),
    };
    const updated = await this.repository.update(
      input.id,
      input.projectId,
      patch,
    );
    if (!updated) {
      throw new NotFoundException('Quick reply not found');
    }
    return updated;
  }

  async remove(input: {
    actorUserId: string;
    projectId: string;
    id: string;
  }): Promise<void> {
    await this.assertCan(input.actorUserId, input.projectId);
    const deleted = await this.repository.deleteInProject(
      input.id,
      input.projectId,
    );
    if (!deleted) {
      throw new NotFoundException('Quick reply not found');
    }
  }

  private assertCan(actorUserId: string, projectId: string) {
    return this.authorizationService.assertCan(
      actorUserId,
      Permission.WHATSAPP_SEND_MESSAGE,
      projectId,
    );
  }
}
