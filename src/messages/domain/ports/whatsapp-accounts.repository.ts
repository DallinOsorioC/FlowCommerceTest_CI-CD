// Credenciales de WhatsApp de un proyecto. tokenEncrypted nunca sale de la
// capa de aplicación: la UI solo ve tokenLast4.
export interface WhatsAppAccount {
  projectId: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  tokenEncrypted: string;
  tokenLast4: string;
  updatedAt: Date;
}

export interface WhatsAppAccountsRepository {
  findByProject(projectId: string): Promise<WhatsAppAccount | null>;
  // Proyecto dueño de un número: lo usa el webhook ENTRANTE para saber a qué
  // tenant pertenece un mensaje. null si ningún proyecto lo tiene guardado.
  findProjectIdByPhoneNumberId(phoneNumberId: string): Promise<string | null>;
  // Crea o reemplaza la cuenta del proyecto. Lanza ConflictException si el
  // phoneNumberId ya pertenece a otro proyecto.
  upsert(input: {
    projectId: string;
    phoneNumberId: string;
    businessAccountId: string | null;
    tokenEncrypted: string;
    tokenLast4: string;
    updatedByUserId: string;
  }): Promise<WhatsAppAccount>;
  // false si el proyecto no tenía cuenta.
  deleteByProject(projectId: string): Promise<boolean>;
}

export const WHATSAPP_ACCOUNTS_REPOSITORY = Symbol(
  'WHATSAPP_ACCOUNTS_REPOSITORY',
);
