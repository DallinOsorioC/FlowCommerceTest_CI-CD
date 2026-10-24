import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { UserProfile } from '@flowcommerce/types';
import {
  BadRequestException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import {
  FILE_STORAGE,
  StoredFileNotFoundError,
  type FileStorage,
} from '../../../files/domain/file-storage';
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  baseMimeType,
  contentMatchesType,
} from '../../../files/domain/file-rules';
import type { UploadedFileInput } from '../../../files/application/use-cases/attachments.use-cases';
import { avatarUrlFor } from '../../domain/entities/user.entity';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';

// Foto de perfil del propio usuario. El id sale SIEMPRE de la sesión.
@Injectable()
export class UploadMyAvatarUseCase {
  private readonly logger = new Logger(UploadMyAvatarUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(FILE_STORAGE)
    private readonly storage: FileStorage,
  ) {}

  // Orden: se guarda la foto nueva, se apunta el usuario a ella y, al final,
  // se borra la anterior. Si algo falla a mitad, nunca queda el usuario
  // apuntando a un archivo que no existe.
  async execute(
    userId: string,
    file: UploadedFileInput | undefined,
  ): Promise<UserProfile> {
    if (!file || file.size === 0) {
      throw new BadRequestException('Attach an image in the "file" field');
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException('The image exceeds the 2 MB limit');
    }
    const mimeType = baseMimeType(file.mimetype);
    const ext = AVATAR_MIME_TYPES[mimeType];
    if (!ext || !contentMatchesType(mimeType, file.buffer)) {
      throw new BadRequestException(
        'The avatar must be a JPG, PNG or WebP image',
      );
    }

    const key = `avatars/${userId}/${randomUUID()}${ext}`;
    await this.storage.save(key, file.buffer);
    const imageUrl = avatarUrlFor(userId, key);
    const result = await this.userRepository.setAvatar(userId, key, imageUrl);
    if (!result) {
      await this.storage.remove(key);
      throw new NotFoundException('User not found');
    }
    await this.removeQuietly(result.previousKey);

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.toProfile();
  }

  private async removeQuietly(key: string | null): Promise<void> {
    if (!key) return;
    await this.storage.remove(key).catch((error: unknown) => {
      this.logger.warn(`Could not remove old avatar ${key}: ${String(error)}`);
    });
  }
}

@Injectable()
export class DeleteMyAvatarUseCase {
  private readonly logger = new Logger(DeleteMyAvatarUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(FILE_STORAGE)
    private readonly storage: FileStorage,
  ) {}

  async execute(userId: string): Promise<void> {
    const result = await this.userRepository.setAvatar(userId, null, null);
    if (!result) {
      throw new NotFoundException('User not found');
    }
    if (result.previousKey) {
      await this.storage.remove(result.previousKey).catch((error: unknown) => {
        this.logger.warn(`Could not remove avatar: ${String(error)}`);
      });
    }
  }
}

// Ver la foto de otro usuario: solo si comparten algún proyecto (compañeros
// de equipo). Para cualquier otro caso responde 404, igual que si no tuviera.
@Injectable()
export class GetUserAvatarUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(FILE_STORAGE)
    private readonly storage: FileStorage,
  ) {}

  async execute(
    viewerUserId: string,
    userId: string,
  ): Promise<{ content: Buffer; mimeType: string }> {
    const [user, sharesProject] = await Promise.all([
      this.userRepository.findById(userId),
      this.userRepository.sharesProjectWith(viewerUserId, userId),
    ]);
    if (!user || !user.avatarKey || !sharesProject) {
      throw new NotFoundException('Avatar not found');
    }
    try {
      return {
        content: await this.storage.read(user.avatarKey),
        mimeType: mimeFromKey(user.avatarKey),
      };
    } catch (error) {
      if (error instanceof StoredFileNotFoundError) {
        throw new NotFoundException('Avatar not found');
      }
      throw error;
    }
  }
}

function mimeFromKey(key: string): string {
  const ext = key.slice(key.lastIndexOf('.'));
  return (
    Object.entries(AVATAR_MIME_TYPES).find(([, value]) => value === ext)?.[0] ??
    'application/octet-stream'
  );
}
