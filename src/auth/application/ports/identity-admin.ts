// Operaciones de administración sobre el proveedor de identidades (Supabase
// Auth) que el backend necesita hacer POR otra persona: crear su cuenta al
// aprobar una solicitud de acceso. El login normal no pasa por aquí.
export interface IdentityAdmin {
  // Crea la cuenta (si no existe) y le envía el correo de invitación para que
  // defina su contraseña. Devuelve su id, que será users.id.
  inviteByEmail(input: {
    email: string;
    name: string;
  }): Promise<{ id: string; alreadyExisted: boolean }>;

  // Cuenta ya confirmada y con contraseña (datos de prueba / seed). Con `id`
  // la cuenta nace con ese id.
  createConfirmedUser(input: {
    id?: string;
    email: string;
    password: string;
    name: string;
  }): Promise<{ id: string }>;
}

export const IDENTITY_ADMIN = Symbol('IDENTITY_ADMIN');
