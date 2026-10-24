import { Permission, Role } from '@flowcommerce/types';
import { ROLE_PERMISSIONS } from './role-permissions';

// Textos de la pestaña «Roles» de Configuración. Los permisos reales siguen
// viviendo SOLO en ROLE_PERMISSIONS; aquí únicamente se les pone nombre y se
// agrupan por área para que el frontend dibuje la matriz sin inventar textos.

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  OWNER: {
    label: 'Propietario',
    description:
      'Control total del proyecto, incluido borrarlo y gestionar a todo el equipo.',
  },
  ADMIN: {
    label: 'Administrador',
    description:
      'Gestiona el equipo, el catálogo, las integraciones y aprueba cotizaciones. No puede borrar el proyecto.',
  },
  MEMBER: {
    label: 'Asesor comercial',
    description:
      'Opera el embudo: crea y mueve leads, cotiza, atiende clientes y escribe por WhatsApp. No aprueba cotizaciones ni borra leads.',
  },
  VIEWER: {
    label: 'Solo lectura',
    description:
      'Consulta leads, cotizaciones, catálogo y clientes sin modificar nada.',
  },
};

export const PERMISSION_INFO: Record<
  Permission,
  { area: string; label: string }
> = {
  PROJECT_READ: { area: 'Proyecto', label: 'Ver el proyecto' },
  PROJECT_CREATE: { area: 'Proyecto', label: 'Crear proyectos' },
  PROJECT_UPDATE: {
    area: 'Proyecto',
    label: 'Editar ajustes, integraciones y WhatsApp',
  },
  PROJECT_DELETE: { area: 'Proyecto', label: 'Eliminar el proyecto' },
  MEMBER_READ: { area: 'Equipo', label: 'Ver miembros' },
  MEMBER_INVITE: { area: 'Equipo', label: 'Invitar y agregar miembros' },
  MEMBER_UPDATE_ROLE: { area: 'Equipo', label: 'Cambiar el rol de un miembro' },
  MEMBER_REMOVE: { area: 'Equipo', label: 'Quitar miembros' },
  LEAD_CREATE: { area: 'Leads', label: 'Crear leads' },
  LEAD_READ: { area: 'Leads', label: 'Ver leads' },
  LEAD_UPDATE: { area: 'Leads', label: 'Editar y mover leads' },
  LEAD_DELETE: { area: 'Leads', label: 'Borrar leads' },
  QUOTE_CREATE: { area: 'Cotizaciones', label: 'Crear y editar cotizaciones' },
  QUOTE_READ: { area: 'Cotizaciones', label: 'Ver cotizaciones' },
  QUOTE_APPROVE: {
    area: 'Cotizaciones',
    label: 'Aprobar y rechazar cotizaciones',
  },
  WHATSAPP_SEND_MESSAGE: {
    area: 'Conversaciones',
    label: 'Ver y enviar mensajes por WhatsApp',
  },
  PRODUCT_READ: { area: 'Productos y servicios', label: 'Ver el catálogo' },
  PRODUCT_MANAGE: {
    area: 'Productos y servicios',
    label: 'Crear, editar y desactivar productos',
  },
  CLIENT_CREATE: { area: 'Clientes', label: 'Crear clientes' },
  CLIENT_READ: { area: 'Clientes', label: 'Ver clientes' },
  CLIENT_UPDATE: { area: 'Clientes', label: 'Editar clientes' },
  CLIENT_DELETE: { area: 'Clientes', label: 'Borrar clientes' },
};

export interface RoleCatalog {
  roles: Array<{
    role: Role;
    label: string;
    description: string;
    permissions: Permission[];
  }>;
  permissions: Array<{ key: Permission; area: string; label: string }>;
}

// De más a menos poder: el orden en que se muestra la matriz.
const ROLE_ORDER: Role[] = [Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER];

export function buildRoleCatalog(): RoleCatalog {
  return {
    roles: ROLE_ORDER.map((role) => ({
      role,
      ...ROLE_INFO[role],
      permissions: [...ROLE_PERMISSIONS[role]],
    })),
    permissions: (Object.keys(PERMISSION_INFO) as Permission[]).map((key) => ({
      key,
      ...PERMISSION_INFO[key],
    })),
  };
}
