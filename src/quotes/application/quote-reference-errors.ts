import { NotFoundException } from '../../common/exceptions/domain.exceptions';
import {
  isForeignKeyViolation,
  violatedConstraint,
} from '../../common/utils/postgres-error';

// Las referencias del body (lead, cliente, producto) las garantiza la base con
// FKs compuestas (x_id, project_id). Si una carrera las rompe entre la
// validación y la escritura, se traduce al mismo 404 que un id inexistente en
// vez de un 500 que revelaría la forma de la base.
const CONSTRAINT_MESSAGES: Record<string, string> = {
  quotes_lead_id_project_id_leads_fk: 'Lead not found in this project',
  quotes_client_id_project_id_clients_fk: 'Client not found in this project',
  quote_items_product_id_project_id_products_fk:
    'Product not found in this project',
};

export function rethrowQuoteReferenceError(error: unknown): never {
  if (isForeignKeyViolation(error)) {
    const message = CONSTRAINT_MESSAGES[violatedConstraint(error) ?? ''];
    if (message) {
      throw new NotFoundException(message);
    }
  }
  throw error;
}
