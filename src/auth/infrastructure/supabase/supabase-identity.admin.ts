import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BadGatewayException,
  ServiceUnavailableException,
} from '../../../common/exceptions/domain.exceptions';
import type { IdentityAdmin } from '../../application/ports/identity-admin';

const TIMEOUT_MS = 10_000;

interface GoTrueUser {
  id?: string;
  msg?: string;
  message?: string;
  error_code?: string;
}

// API de administración de Supabase Auth (GoTrue) con la service-role key.
// Esa clave se salta todo control de acceso: vive solo en el servidor.
@Injectable()
export class SupabaseIdentityAdmin implements IdentityAdmin {
  private readonly authUrl: string | undefined;
  private readonly serviceKey: string | undefined;
  private readonly redirectTo: string | undefined;

  constructor(
    configService: ConfigService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const url = configService.get<string>('SUPABASE_URL')?.replace(/\/$/, '');
    this.authUrl = url ? `${url}/auth/v1` : undefined;
    this.serviceKey = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    // A dónde lleva el enlace del correo (la pantalla de «definir contraseña»).
    this.redirectTo =
      configService.get<string>('SUPABASE_INVITE_REDIRECT_URL') ??
      configService.get<string>('APP_URL');
  }

  async inviteByEmail(input: {
    email: string;
    name: string;
  }): Promise<{ id: string; alreadyExisted: boolean }> {
    const query = this.redirectTo
      ? `?redirect_to=${encodeURIComponent(this.redirectTo)}`
      : '';
    const response = await this.call(`/invite${query}`, {
      email: input.email,
      data: { name: input.name },
    });
    if (response.ok) {
      return { id: await this.idOf(response), alreadyExisted: false };
    }
    if (await this.isAlreadyRegistered(response)) {
      // La cuenta ya existe en Supabase: se resuelve su id sin enviar correo.
      const link = await this.call('/admin/generate_link', {
        type: 'magiclink',
        email: input.email,
      });
      if (link.ok) {
        return { id: await this.idOf(link), alreadyExisted: true };
      }
    }
    throw new BadGatewayException('Supabase Auth could not invite this user');
  }

  async createConfirmedUser(input: {
    id?: string;
    email: string;
    password: string;
    name: string;
  }): Promise<{ id: string }> {
    const response = await this.call('/admin/users', {
      ...(input.id ? { id: input.id } : {}),
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name },
    });
    if (!response.ok) {
      throw new BadGatewayException(
        `Supabase Auth could not create ${input.email}: HTTP ${response.status}`,
      );
    }
    return { id: await this.idOf(response) };
  }

  private call(path: string, body: unknown): Promise<Response> {
    if (!this.authUrl || !this.serviceKey) {
      throw new ServiceUnavailableException(
        'Supabase Auth is not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)',
      );
    }
    return this.fetchImpl(`${this.authUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  private async idOf(response: Response): Promise<string> {
    const body = (await response.json()) as GoTrueUser;
    if (!body.id) {
      throw new BadGatewayException('Supabase Auth did not return the user id');
    }
    return body.id;
  }

  private async isAlreadyRegistered(response: Response): Promise<boolean> {
    if (response.status !== 422 && response.status !== 400) {
      return false;
    }
    const body = (await response
      .clone()
      .json()
      .catch(() => ({}))) as GoTrueUser;
    return (
      body.error_code === 'email_exists' ||
      /already.*registered|already been registered/i.test(
        body.msg ?? body.message ?? '',
      )
    );
  }
}
