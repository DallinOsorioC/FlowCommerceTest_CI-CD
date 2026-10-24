import {
  ConflictException,
  NotFoundException,
} from '../../common/exceptions/domain.exceptions';
import type { LeadReferencesReader } from '../domain/repositories/lead-references.reader';

// Un lead nuevo o editado no puede apuntar a un cliente desactivado (C4) ni a
// un producto desactivado como interés (P4): 409. Si no existen en el
// proyecto, 404. undefined (no viene) y null (se quita) no se comprueban.
export async function assertActiveReferences(
  reader: LeadReferencesReader,
  projectId: string,
  refs: { clientId?: string | null; interestProductId?: string | null },
): Promise<void> {
  if (refs.clientId) {
    const client = await reader.findClientInProject(refs.clientId, projectId);
    if (!client) {
      throw new NotFoundException('Client not found in this project');
    }
    if (!client.active) {
      throw new ConflictException(`Client "${client.name}" is inactive`);
    }
  }
  if (refs.interestProductId) {
    const product = await reader.findProductInProject(
      refs.interestProductId,
      projectId,
    );
    if (!product) {
      throw new NotFoundException('Product not found in this project');
    }
    if (!product.active) {
      throw new ConflictException(`Product "${product.name}" is inactive`);
    }
  }
}
