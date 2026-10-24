import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../authorization/application/services/authorization.service';
import { ForbiddenException } from '../../common/exceptions/domain.exceptions';
import {
  SEARCH_REPOSITORY,
  type SearchRepository,
  type SearchResults,
  type SearchScope,
} from '../domain/search';

const SCOPE_PERMISSION: Record<SearchScope, Permission> = {
  leads: Permission.LEAD_READ,
  clients: Permission.CLIENT_READ,
  quotes: Permission.QUOTE_READ,
};

// Búsqueda global del proyecto. Solo busca en lo que el rol puede leer: si un
// rol no tuviera CLIENT_READ, la sección de clientes vuelve vacía.
@Injectable()
export class GlobalSearchUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(SEARCH_REPOSITORY)
    private readonly repository: SearchRepository,
  ) {}

  async execute(input: {
    actorUserId: string;
    projectId: string;
    q: string;
    limit: number;
  }): Promise<SearchResults> {
    const decision = await this.authorizationService.decide(
      input.actorUserId,
      [Permission.PROJECT_READ],
      input.projectId,
    );
    if (!decision.allowed || !decision.role) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }
    const role = decision.role;
    const scopes = (Object.keys(SCOPE_PERMISSION) as SearchScope[]).filter(
      (scope) =>
        this.authorizationService.roleHasAny(role, [SCOPE_PERMISSION[scope]]),
    );
    return this.repository.search(
      input.projectId,
      input.q.trim(),
      scopes,
      input.limit,
    );
  }
}
