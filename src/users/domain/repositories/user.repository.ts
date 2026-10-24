import type { UserEntity } from '../entities/user.entity';

export interface CreateUserInput {
  // Id del usuario en Supabase Auth: users.id y auth.users.id son el mismo.
  // Sin él se genera uno (solo para datos que no vienen de Supabase).
  id?: string;
  name: string;
  email: string;
}

// Campos del perfil que edita el propio usuario. null borra el dato.
export interface UpdateUserProfileInput {
  // N11: el nombre visible también es editable por el propio usuario.
  name?: string;
  phone?: string | null;
  position?: string | null;
}

// Puerto del repositorio de usuarios (lo implementa Drizzle en infraestructura).
export interface UserRepository {
  findByEmail(email: string): Promise<UserEntity | null>;
  findById(id: string): Promise<UserEntity | null>;
  create(input: CreateUserInput): Promise<UserEntity>;
  existsByEmail(email: string): Promise<boolean>;
  // null si el usuario no existe.
  updateProfile(
    id: string,
    input: UpdateUserProfileInput,
  ): Promise<UserEntity | null>;
  // Cambia (o quita, con null) la foto de perfil. Devuelve la clave anterior
  // para que el caso de uso borre el archivo viejo; undefined si no existe.
  setAvatar(
    id: string,
    avatarKey: string | null,
    imageUrl: string | null,
  ): Promise<{ previousKey: string | null } | undefined>;
  // true si ambos usuarios son miembros de al menos un proyecto en común
  // (o son el mismo usuario): solo así se puede ver la foto del otro.
  sharesProjectWith(userId: string, otherUserId: string): Promise<boolean>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
