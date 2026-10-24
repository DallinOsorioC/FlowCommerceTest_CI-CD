import type {
  Project,
  ProjectBillingProfile,
  ProjectDetail,
  ProjectQuoteSettings,
} from '@flowcommerce/types';

// Valores por defecto: son los mismos que las columnas de la base, para los
// proyectos construidos sin ajustes (p. ej. en tests).
export const DEFAULT_BILLING: ProjectBillingProfile = {
  legalName: null,
  taxId: null,
  address: null,
  phone: null,
  email: null,
};
export const DEFAULT_QUOTE_SETTINGS: ProjectQuoteSettings = {
  taxPercent: 12,
  folioPrefix: 'COT',
  validityDays: 30,
  defaultTerms: null,
  currency: 'GTQ',
};

// Entidad de dominio de un proyecto (el tenant del sistema).
export class ProjectEntity implements Project {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly slug: string,
    public readonly description: string | null,
    public readonly creadoEn: Date,
    public readonly actualizadoEn: Date,
    public readonly billing: ProjectBillingProfile = DEFAULT_BILLING,
    public readonly quoteSettings: ProjectQuoteSettings = DEFAULT_QUOTE_SETTINGS,
  ) {}

  toProjectDetail(): ProjectDetail {
    return {
      ...this.toProject(),
      billing: this.billing,
      quoteSettings: this.quoteSettings,
    };
  }

  toProject(): Project {
    return {
      id: this.id,
      name: this.name,
      slug: this.slug,
      description: this.description,
      creadoEn: this.creadoEn,
      actualizadoEn: this.actualizadoEn,
    };
  }
}
