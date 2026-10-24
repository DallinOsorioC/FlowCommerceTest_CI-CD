import type { AccessRequest, AccessRequestStatus } from '@flowcommerce/types';

// Entidad de dominio de una solicitud de acceso a un proyecto (tenant).
export class AccessRequestEntity implements AccessRequest {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly email: string,
    public readonly status: AccessRequestStatus,
    public readonly atendidoEn: Date | null,
    public readonly atendidoPorUserId: string | null,
    public readonly creadoEn: Date,
    public readonly actualizadoEn: Date,
  ) {}

  toAccessRequest(): AccessRequest {
    return {
      id: this.id,
      projectId: this.projectId,
      email: this.email,
      status: this.status,
      atendidoEn: this.atendidoEn,
      atendidoPorUserId: this.atendidoPorUserId,
      creadoEn: this.creadoEn,
      actualizadoEn: this.actualizadoEn,
    };
  }
}
