import type { Client, ClientId } from '@flowcommerce/types';

export interface AssignedUserSummary {
  id: string;
  name: string;
}

// Cliente (cuenta) del proyecto. `assignedUser` es una proyección de lectura
// (nombre del responsable) para que el listado no obligue a una petición por
// fila; la fuente de verdad sigue siendo assignedUserId.
export class ClientEntity implements Client {
  constructor(
    public readonly id: ClientId,
    public readonly projectId: string,
    public readonly name: string,
    public readonly company: string | null,
    public readonly taxId: string | null,
    public readonly email: string | null,
    public readonly phone: string | null,
    public readonly notes: string | null,
    public readonly assignedUserId: string | null,
    public readonly sourceLeadId: string | null,
    public readonly active: boolean,
    public readonly creadoEn: Date,
    public readonly actualizadoEn: Date,
    public readonly assignedUser: AssignedUserSummary | null = null,
    // Cargo del contacto (N9). Al final para no reordenar el constructor.
    public readonly contactPosition: string | null = null,
  ) {}

  toClient(): Client & { assignedUser: AssignedUserSummary | null } {
    return {
      id: this.id,
      projectId: this.projectId,
      name: this.name,
      contactPosition: this.contactPosition,
      company: this.company,
      taxId: this.taxId,
      email: this.email,
      phone: this.phone,
      notes: this.notes,
      assignedUserId: this.assignedUserId,
      assignedUser: this.assignedUser,
      sourceLeadId: this.sourceLeadId,
      active: this.active,
      creadoEn: this.creadoEn,
      actualizadoEn: this.actualizadoEn,
    };
  }
}
