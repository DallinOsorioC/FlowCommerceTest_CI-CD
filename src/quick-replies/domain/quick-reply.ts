export interface QuickReply {
  id: string;
  projectId: string;
  shortcut: string;
  title: string;
  content: string;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Atajo que el asesor escribe tras "/" en el chat: minúsculas, dígitos y
// guiones, sin espacios.
export const SHORTCUT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export interface QuickRepliesRepository {
  listByProject(projectId: string): Promise<QuickReply[]>;
  // Lanza ConflictException si el atajo ya existe en el proyecto.
  create(input: {
    projectId: string;
    shortcut: string;
    title: string;
    content: string;
    createdByUserId: string;
  }): Promise<QuickReply>;
  // null si no existe en el proyecto. Lanza ConflictException si el nuevo
  // atajo ya lo usa otra respuesta.
  update(
    id: string,
    projectId: string,
    patch: { shortcut?: string; title?: string; content?: string },
  ): Promise<QuickReply | null>;
  deleteInProject(id: string, projectId: string): Promise<boolean>;
}

export const QUICK_REPLIES_REPOSITORY = Symbol('QUICK_REPLIES_REPOSITORY');
