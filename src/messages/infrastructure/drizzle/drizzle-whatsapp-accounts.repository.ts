import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ConflictException } from '../../../common/exceptions/domain.exceptions';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { whatsappAccounts, type WhatsAppAccountRow } from '../../../db/schema';
import type {
  WhatsAppAccount,
  WhatsAppAccountsRepository,
} from '../../domain/ports/whatsapp-accounts.repository';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class DrizzleWhatsAppAccountsRepository implements WhatsAppAccountsRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async findByProject(projectId: string): Promise<WhatsAppAccount | null> {
    const [row] = await this.db
      .select()
      .from(whatsappAccounts)
      .where(eq(whatsappAccounts.projectId, projectId))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async findProjectIdByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ projectId: whatsappAccounts.projectId })
      .from(whatsappAccounts)
      .where(eq(whatsappAccounts.phoneNumberId, phoneNumberId))
      .limit(1);
    return row?.projectId ?? null;
  }

  async upsert(
    input: Parameters<WhatsAppAccountsRepository['upsert']>[0],
  ): Promise<WhatsAppAccount> {
    const { projectId, ...values } = input;
    try {
      const [row] = await this.db
        .insert(whatsappAccounts)
        .values({ projectId, ...values })
        .onConflictDoUpdate({
          target: whatsappAccounts.projectId,
          // $onUpdate no aplica en un upsert: la fecha se fija a mano.
          set: { ...values, updatedAt: new Date() },
        })
        .returning();
      return this.map(row);
    } catch (error) {
      if (this.isPhoneNumberTaken(error)) {
        throw new ConflictException(
          'This WhatsApp phone number is already linked to another project',
        );
      }
      throw error;
    }
  }

  async deleteByProject(projectId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(whatsappAccounts)
      .where(eq(whatsappAccounts.projectId, projectId))
      .returning({ id: whatsappAccounts.id });
    return deleted.length > 0;
  }

  private isPhoneNumberTaken(error: unknown): boolean {
    const cause = (error as { cause?: { code?: string } } | null)?.cause;
    const code = (error as { code?: string } | null)?.code ?? cause?.code;
    return code === UNIQUE_VIOLATION;
  }

  private map(row: WhatsAppAccountRow): WhatsAppAccount {
    return {
      projectId: row.projectId,
      phoneNumberId: row.phoneNumberId,
      businessAccountId: row.businessAccountId,
      tokenEncrypted: row.tokenEncrypted,
      tokenLast4: row.tokenLast4,
      updatedAt: row.updatedAt,
    };
  }
}
