import type { User, UserProfile } from '@flowcommerce/types';

// Ruta pública de la API que sirve la foto de perfil. El ?v= es el nombre del
// archivo (un uuid nuevo por foto), así el navegador no reutiliza la anterior.
export function avatarUrlFor(
  userId: string,
  avatarKey: string | null,
): string | null {
  if (!avatarKey) {
    return null;
  }
  const version = avatarKey.split('/').pop()?.split('.')[0] ?? '';
  return `/api/v1/users/${userId}/avatar?v=${version}`;
}

// Entidad de dominio de un usuario del sistema.
export class UserEntity implements User {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly email: string,
    public readonly creadoEn: Date,
    public readonly actualizadoEn: Date,
    public readonly emailVerified = false,
    public readonly phone: string | null = null,
    public readonly position: string | null = null,
    // Clave de la foto de perfil en el almacenamiento de archivos.
    public readonly avatarKey: string | null = null,
  ) {}

  get avatarUrl(): string | null {
    return avatarUrlFor(this.id, this.avatarKey);
  }

  toProfile(): UserProfile {
    return {
      ...this.toUser(),
      phone: this.phone,
      position: this.position,
      avatarUrl: this.avatarUrl,
    };
  }

  toUser(): User {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      creadoEn: this.creadoEn,
      actualizadoEn: this.actualizadoEn,
    };
  }
}
