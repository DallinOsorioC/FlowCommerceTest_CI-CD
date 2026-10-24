import type {
  Lead,
  LeadId,
  LeadSource,
  LeadStage,
  RecordOrigin,
} from '@flowcommerce/types';

// Resumen {id, name} de una referencia, para que el listado muestre nombres
// (responsable, cliente, producto) sin una petición por fila.
export interface RefSummary {
  id: string;
  name: string;
}

// contactPosition y origin son opcionales al construir (por defecto null y
// MANUAL) para no obligar a cada test a repetirlos.
export interface LeadProps extends Omit<Lead, 'contactPosition' | 'origin'> {
  contactPosition?: string | null;
  origin?: RecordOrigin;
  assignedUser?: RefSummary | null;
  client?: RefSummary | null;
  interestProduct?: RefSummary | null;
  // Fecha del próximo seguimiento PENDING (null si no tiene).
  nextFollowUpAt?: Date | null;
}

// Entidad de dominio de un lead, siempre atada a su proyecto (tenant).
export class LeadEntity implements Lead {
  public readonly id: LeadId;
  public readonly projectId: string;
  public readonly name: string;
  public readonly email: string | null;
  public readonly phone: string | null;
  public readonly stage: LeadStage;
  public readonly score: number;
  public readonly company: string | null;
  public readonly contactPosition: string | null;
  public readonly origin: RecordOrigin;
  public readonly source: LeadSource | null;
  public readonly estimatedValue: number | null;
  public readonly notes: string | null;
  public readonly assignedUserId: string | null;
  public readonly clientId: string | null;
  public readonly interestProductId: string | null;
  public readonly lastContactAt: Date | null;
  public readonly creadoEn: Date;
  public readonly actualizadoEn: Date;
  public readonly assignedUser: RefSummary | null;
  public readonly client: RefSummary | null;
  public readonly interestProduct: RefSummary | null;
  public readonly nextFollowUpAt: Date | null;

  constructor(props: LeadProps) {
    this.id = props.id;
    this.projectId = props.projectId;
    this.name = props.name;
    this.email = props.email;
    this.phone = props.phone;
    this.stage = props.stage;
    this.score = props.score;
    this.company = props.company;
    this.contactPosition = props.contactPosition ?? null;
    this.origin = props.origin ?? 'MANUAL';
    this.source = props.source;
    this.estimatedValue = props.estimatedValue;
    this.notes = props.notes;
    this.assignedUserId = props.assignedUserId;
    this.clientId = props.clientId;
    this.interestProductId = props.interestProductId;
    this.lastContactAt = props.lastContactAt;
    this.creadoEn = props.creadoEn;
    this.actualizadoEn = props.actualizadoEn;
    this.assignedUser = props.assignedUser ?? null;
    this.client = props.client ?? null;
    this.interestProduct = props.interestProduct ?? null;
    this.nextFollowUpAt = props.nextFollowUpAt ?? null;
  }

  toLead(): Lead & {
    assignedUser: RefSummary | null;
    client: RefSummary | null;
    interestProduct: RefSummary | null;
    nextFollowUpAt: Date | null;
  } {
    return {
      id: this.id,
      projectId: this.projectId,
      name: this.name,
      email: this.email,
      phone: this.phone,
      stage: this.stage,
      score: this.score,
      company: this.company,
      contactPosition: this.contactPosition,
      source: this.source,
      origin: this.origin,
      estimatedValue: this.estimatedValue,
      notes: this.notes,
      assignedUserId: this.assignedUserId,
      assignedUser: this.assignedUser,
      clientId: this.clientId,
      client: this.client,
      interestProductId: this.interestProductId,
      interestProduct: this.interestProduct,
      lastContactAt: this.lastContactAt,
      nextFollowUpAt: this.nextFollowUpAt,
      creadoEn: this.creadoEn,
      actualizadoEn: this.actualizadoEn,
    };
  }
}
