import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  ACTIVITY_REPOSITORY,
  ACTIVITY_SINK,
  type ActivityRepository,
  type ActivitySink,
  type RecordActivityInput,
} from '../domain/activity';

// Punto único para escribir en el historial de actividad desde otros módulos
// (leads, cotizaciones, mensajes, seguimientos, archivos).
//
// Igual que las notificaciones, la actividad es un efecto SECUNDARIO: si
// falla, se registra en el log y la operación principal sigue. Por eso
// record() nunca lanza.
@Injectable()
export class ActivityRecorder {
  private readonly logger = new Logger(ActivityRecorder.name);

  constructor(
    @Inject(ACTIVITY_REPOSITORY)
    private readonly repository: ActivityRepository,
    @Optional()
    @Inject(ACTIVITY_SINK)
    private readonly sink?: ActivitySink,
  ) {}

  async record(input: RecordActivityInput): Promise<void> {
    try {
      const event = { ...input, title: input.title.slice(0, 255) };
      await this.repository.insert(event);
      this.notify(event);
    } catch (error) {
      this.logger.error(
        `Could not record ${input.type} activity: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Los webhooks son otro efecto secundario: un sink roto no debe hacer que
  // parezca que falló el registro de la actividad.
  private notify(event: RecordActivityInput): void {
    try {
      this.sink?.onActivity(event);
    } catch (error) {
      this.logger.error(
        `Activity sink failed for ${event.type}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
