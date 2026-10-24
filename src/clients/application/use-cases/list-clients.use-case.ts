import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  CLIENTS_REPOSITORY,
  type ClientRepository,
  type ClientSortField,
  type ClientStats,
  type PaginatedClients,
} from '../../domain/repositories/client.repository';

export interface ListClientsInput {
  actorUserId: string;
  projectId: string;
  search?: string;
  assignedUserId?: string;
  active?: boolean;
  sortBy?: ClientSortField;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

@Injectable()
export class ListClientsUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(CLIENTS_REPOSITORY)
    private readonly clientRepository: ClientRepository,
  ) {}

  // Cada cliente de la página va con sus estadísticas (B10): la pantalla de
  // Clientes muestra cotizaciones y ventas por fila sin una llamada por cliente.
  async execute(
    input: ListClientsInput,
    now = new Date(),
  ): Promise<
    PaginatedClients & {
      statsById: Map<string, ClientStats>;
      summary: { activeClients: number; billedThisYear: number };
    }
  > {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.CLIENT_READ,
      input.projectId,
    );

    const page = await this.clientRepository.listByProject(input.projectId, {
      search: input.search,
      assignedUserId: input.assignedUserId,
      active: input.active,
      sortBy: input.sortBy,
      order: input.order,
      page: input.page,
      limit: input.limit,
    });
    const [statsById, summary] = await Promise.all([
      this.clientRepository.getStatsForClientsInProject(
        page.clients.map((client) => client.id),
        input.projectId,
      ),
      // «Facturado este año»: desde el 1 de enero (UTC) del año en curso.
      this.clientRepository.getSummaryInProject(
        input.projectId,
        new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
      ),
    ]);
    return {
      ...page,
      statsById,
      summary: {
        activeClients: summary.activeClients,
        billedThisYear: summary.billedSince,
      },
    };
  }
}
