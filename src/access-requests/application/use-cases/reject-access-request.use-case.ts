import { Inject, Injectable } from '@nestjs/common';
import { AccessRequestStatus, Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { AccessRequestEntity } from '../../domain/entities/access-request.entity';
import {
  ACCESS_REQUEST_REPOSITORY,
  type AccessRequestRepository,
} from '../../domain/repositories/access-request.repository';

export interface RejectAccessRequestInput {
  actorUserId: string;
  projectId: string;
  requestId: string;
}

@Injectable()
export class RejectAccessRequestUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(ACCESS_REQUEST_REPOSITORY)
    private readonly accessRequestRepository: AccessRequestRepository,
  ) {}

  // Rechaza una solicitud PENDING del tenant. Acotada por projectId (el id de
  // otra solicitud de otro proyecto responde 404) y MEMBER_INVITE.
  async execute(input: RejectAccessRequestInput): Promise<AccessRequestEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.MEMBER_INVITE,
      input.projectId,
    );

    const request = await this.accessRequestRepository.findByIdAndProject(
      input.requestId,
      input.projectId,
    );
    if (!request) {
      throw new NotFoundException('Access request not found');
    }
    if (request.status !== AccessRequestStatus.PENDING) {
      throw new ConflictException('Access request is already handled');
    }

    const rejected = await this.accessRequestRepository.rejectPending(
      input.requestId,
      input.projectId,
      input.actorUserId,
    );
    if (!rejected) {
      throw new ConflictException('Access request is already handled');
    }

    return rejected;
  }
}
