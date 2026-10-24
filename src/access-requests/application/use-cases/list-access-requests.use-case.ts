import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { AccessRequestEntity } from '../../domain/entities/access-request.entity';
import {
  ACCESS_REQUEST_REPOSITORY,
  type AccessRequestRepository,
} from '../../domain/repositories/access-request.repository';

export interface ListAccessRequestsInput {
  actorUserId: string;
  projectId: string;
}

@Injectable()
export class ListAccessRequestsUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(ACCESS_REQUEST_REPOSITORY)
    private readonly accessRequestRepository: AccessRequestRepository,
  ) {}

  // Lista las solicitudes del tenant. El guard ya validó MEMBER_INVITE en el
  // borde HTTP; aquí se re-verifica por defensa en profundidad y, sobre todo,
  // se acota la consulta estrictamente al proyecto.
  async execute(
    input: ListAccessRequestsInput,
  ): Promise<AccessRequestEntity[]> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.MEMBER_INVITE,
      input.projectId,
    );

    return this.accessRequestRepository.listByProject(input.projectId);
  }
}
