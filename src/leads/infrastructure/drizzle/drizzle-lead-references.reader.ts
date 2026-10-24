import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { clients, products } from '../../../db/schema';
import type {
  LeadReferencesReader,
  ReferenceStatus,
} from '../../domain/repositories/lead-references.reader';

// projectId SIEMPRE en el WHERE: un cliente o producto de otro tenant se
// comporta igual que uno inexistente (null).
@Injectable()
export class DrizzleLeadReferencesReader implements LeadReferencesReader {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async findClientInProject(
    clientId: string,
    projectId: string,
  ): Promise<ReferenceStatus | null> {
    const [row] = await this.db
      .select({ name: clients.name, active: clients.active })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.projectId, projectId)));
    return row ?? null;
  }

  async findProductInProject(
    productId: string,
    projectId: string,
  ): Promise<ReferenceStatus | null> {
    const [row] = await this.db
      .select({ name: products.name, active: products.active })
      .from(products)
      .where(
        and(eq(products.id, productId), eq(products.projectId, projectId)),
      );
    return row ?? null;
  }
}
