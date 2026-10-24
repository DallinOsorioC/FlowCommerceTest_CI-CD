import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RunRemindersUseCase } from '../../application/use-cases/run-reminders.use-case';

// Scheduler (@nestjs/schedule): cada 10 minutos revisa seguimientos vencidos
// y cotizaciones enviadas que vencieron, y genera las notificaciones.
//
// - SCHEDULER_ENABLED=false lo apaga (los e2e lo apagan y llaman al caso de
//   uso directamente).
// - Si una ejecución tarda más que el intervalo, la siguiente se salta: así
//   nunca corren dos a la vez en el mismo proceso. Con varias instancias de la
//   API, las dedupeKey evitan avisos repetidos.
@Injectable()
export class RemindersScheduler {
  private readonly logger = new Logger(RemindersScheduler.name);
  private running = false;

  constructor(private readonly runReminders: RunRemindersUseCase) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'reminders' })
  async tick(): Promise<void> {
    if (process.env.SCHEDULER_ENABLED === 'false' || this.running) {
      return;
    }
    this.running = true;
    try {
      const result = await this.runReminders.execute();
      if (result.followUps + result.quotes + result.staleLeads > 0) {
        this.logger.log(
          `Reminders sent: ${result.followUps} follow-up, ${result.quotes} expired quote, ${result.staleLeads} stale lead`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Reminders job failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
