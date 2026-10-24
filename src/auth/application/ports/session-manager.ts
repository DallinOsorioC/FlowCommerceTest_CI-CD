import type { AuthenticatedSession } from '../../domain/session.types';

// Puerto que abstrae de dónde sale la sesión de quien llama. Hoy es el access
// token de Supabase Auth (Authorization: Bearer). El dominio y la aplicación
// dependen de esta interfaz, no de Supabase.
//
// El login, el registro y la recuperación de contraseña los hace el frontend
// directamente con el proveedor; el backend solo reconoce la sesión.
export interface SessionManager {
  // null si no hay credenciales o no son válidas.
  getSession(headers: Headers): Promise<AuthenticatedSession | null>;
}

export const SESSION_MANAGER = Symbol('SESSION_MANAGER');
