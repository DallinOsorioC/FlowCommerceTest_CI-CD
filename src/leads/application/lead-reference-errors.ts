import { NotFoundException } from '../../common/exceptions/domain.exceptions';
import {
  isForeignKeyViolation,
  violatedConstraint,
} from '../../common/utils/postgres-error';

// Las referencias del body a cliente y producto las garantiza la base con FKs
// compuestas (x_id, project_id): un id de otro tenant no satisface la FK y la
// inserción falla. Aquí esa violación se traduce al mismo 404 que un id
// inexistente, en vez de un 500 que revelaría la forma de la base.
const CONSTRAINT_MESSAGES: Record<string, string> = {
  leads_client_id_project_id_clients_fk: 'Client not found in this project',
  leads_interest_product_id_project_id_products_fk:
    'Product not found in this project',
};

export function rethrowLeadReferenceError(error: unknown): never {
  if (isForeignKeyViolation(error)) {
    const message = CONSTRAINT_MESSAGES[violatedConstraint(error) ?? ''];
    if (message) {
      throw new NotFoundException(message);
    }
  }
  throw error;
}
