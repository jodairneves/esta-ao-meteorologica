import { type ClientAction, ensureClient, ensureClientRoles } from './clients';
import type { DynsecClient } from './dynsec';
import { ROLE_DEFINITIONS, ROLE_NAMES, type RoleAction, syncRole } from './roles';

export const ADMIN_USERNAME = 'admin';
export const COLLECTOR_USERNAME = 'collector';
export const COLLECTOR_CLIENT_ID = 'collector';

export interface BootstrapOptions {
  collectorPassword: string;
  /** The dashboard's MQTT user; created by Mosquitto from MOSQUITTO_DYNSEC_PASSWORD. */
  adminUsername?: string;
}

export interface BootstrapReport {
  roles: Record<string, RoleAction>;
  collector: ClientAction;
  adminRolesAdded: string[];
}

/**
 * Idempotent broker setup: default ACL access, system roles, the collector client and the
 * extra role of the admin client used by the dashboard. Runs on every dashboard start.
 */
export async function bootstrapBroker(
  dynsec: DynsecClient,
  options: BootstrapOptions,
): Promise<BootstrapReport> {
  await dynsec.run({
    command: 'setDefaultACLAccess',
    acls: [
      { acltype: 'publishClientSend', allow: false },
      { acltype: 'publishClientReceive', allow: true },
      { acltype: 'subscribe', allow: false },
      { acltype: 'unsubscribe', allow: true },
    ],
  });

  const roles: Record<string, RoleAction> = {};
  for (const definition of ROLE_DEFINITIONS) {
    roles[definition.rolename] = await syncRole(dynsec, definition);
  }

  const collector = await ensureClient(dynsec, {
    username: COLLECTOR_USERNAME,
    password: options.collectorPassword,
    clientid: COLLECTOR_CLIENT_ID,
    textname: 'Collector (App 1)',
    roles: [ROLE_NAMES.collector],
  });

  const adminRolesAdded = await ensureClientRoles(dynsec, options.adminUsername ?? ADMIN_USERNAME, [
    ROLE_NAMES.dashboardOps,
  ]);

  return { roles, collector, adminRolesAdded };
}
