import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { paymentEvents } from '../../../db/schema';
import type {
  PaymentEventResult,
  PaymentEventsRepository,
} from '../../domain/payments';

@Injectable()
export class DrizzlePaymentEventsRepository implements PaymentEventsRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async exists(eventId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: paymentEvents.id })
      .from(paymentEvents)
      .where(eq(paymentEvents.eventId, eventId))
      .limit(1);
    return row !== undefined;
  }

  async record(input: {
    projectId: string;
    quoteId: string;
    eventId: string;
    type: string;
    amount: number | null;
    currency: string | null;
    reference: string | null;
    result: PaymentEventResult;
  }): Promise<void> {
    await this.db
      .insert(paymentEvents)
      .values(input)
      .onConflictDoNothing({ target: paymentEvents.eventId });
  }
}
