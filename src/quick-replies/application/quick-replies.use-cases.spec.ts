/* eslint-disable @typescript-eslint/unbound-method -- los mocks de jest se inspeccionan como propiedades */
import { Permission } from '@flowcommerce/types';
import type { AuthorizationService } from '../../authorization/application/services/authorization.service';
import {
  BadRequestException,
  NotFoundException,
} from '../../common/exceptions/domain.exceptions';
import type { QuickRepliesRepository } from '../domain/quick-reply';
import { QuickRepliesUseCases } from './quick-replies.use-cases';

describe('QuickRepliesUseCases', () => {
  const actorUserId = '11111111-1111-4111-8111-111111111111';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const id = '55555555-5555-4555-8555-555555555555';

  const authorizationService = {
    assertCan: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuthorizationService>;
  const repository: jest.Mocked<QuickRepliesRepository> = {
    listByProject: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteInProject: jest.fn(),
  };
  const useCases = new QuickRepliesUseCases(authorizationService, repository);

  beforeEach(() => jest.clearAllMocks());

  it('normalizes the shortcut (strips "/" and lowercases) and trims content', async () => {
    await useCases.create({
      actorUserId,
      projectId,
      shortcut: ' /Saludo ',
      title: ' Saludo ',
      content: '  Hola  ',
    });

    expect(authorizationService.assertCan).toHaveBeenCalledWith(
      actorUserId,
      Permission.WHATSAPP_SEND_MESSAGE,
      projectId,
    );
    expect(repository.create).toHaveBeenCalledWith({
      projectId,
      shortcut: 'saludo',
      title: 'Saludo',
      content: 'Hola',
      createdByUserId: actorUserId,
    });
  });

  it.each(['con espacio', 'ñandú', '', '/'])(
    'rejects the invalid shortcut %p',
    async (shortcut) => {
      await expect(
        useCases.create({
          actorUserId,
          projectId,
          shortcut,
          title: 't',
          content: 'c',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    },
  );

  it('rejects blank content', async () => {
    await expect(
      useCases.create({
        actorUserId,
        projectId,
        shortcut: 'ok',
        title: 't',
        content: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s when updating or deleting a reply from another project', async () => {
    repository.update.mockResolvedValue(null);
    repository.deleteInProject.mockResolvedValue(false);

    await expect(
      useCases.update({ actorUserId, projectId, id, title: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      useCases.remove({ actorUserId, projectId, id }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
