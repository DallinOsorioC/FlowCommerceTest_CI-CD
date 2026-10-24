import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { BadRequestException } from '../../../common/exceptions/domain.exceptions';
import {
  buildDashboard,
  buildPeriodComparison,
  previousRange,
} from '../../domain/build-dashboard';
import type {
  DashboardAggregate,
  DateRange,
} from '../../domain/dashboard.types';
import {
  DASHBOARD_REPOSITORY,
  type DashboardRepository,
} from '../../domain/repositories/dashboard.repository';

export interface GetDashboardInput {
  actorUserId: string;
  projectId: string;
  // Opcionales, pero van juntos: [from, to).
  from?: Date;
  to?: Date;
}

// Un rango más largo no aporta a un Dashboard y obliga a Postgres a recorrer
// demasiadas filas.
export const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

// Entrega el agregado de métricas del Dashboard para un proyecto.
//
// El guard ya valida PROJECT_READ en el borde HTTP; igual que el resto de
// use-cases se re-verifica aquí con assertCan (defensa en profundidad). Si la
// autorización falla no se consulta nada. El repositorio solo agrega filas del
// projectId autorizado y la composición del contrato es una función pura.
@Injectable()
export class GetDashboardUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(DASHBOARD_REPOSITORY)
    private readonly dashboardRepository: DashboardRepository,
  ) {}

  async execute(input: GetDashboardInput): Promise<DashboardAggregate> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PROJECT_READ,
      input.projectId,
    );

    const range = this.toRange(input);
    if (!range) {
      // Sin rango: comportamiento histórico de siempre (compatible).
      const rows = await this.dashboardRepository.getMetricsRows(
        input.projectId,
      );
      return buildDashboard(rows);
    }

    const [rows, actual, anterior] = await Promise.all([
      this.dashboardRepository.getMetricsRows(input.projectId, range),
      this.dashboardRepository.getPeriodTotals(input.projectId, range),
      this.dashboardRepository.getPeriodTotals(
        input.projectId,
        previousRange(range),
      ),
    ]);
    return buildDashboard(rows, buildPeriodComparison(range, actual, anterior));
  }

  private toRange(input: GetDashboardInput): DateRange | undefined {
    if (!input.from && !input.to) {
      return undefined;
    }
    if (!input.from || !input.to) {
      throw new BadRequestException('from and to must be sent together');
    }
    if (input.to.getTime() <= input.from.getTime()) {
      throw new BadRequestException('to must be after from');
    }
    if (input.to.getTime() - input.from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new BadRequestException(
        `The range cannot be longer than ${MAX_RANGE_DAYS} days`,
      );
    }
    return { from: input.from, to: input.to };
  }
}
