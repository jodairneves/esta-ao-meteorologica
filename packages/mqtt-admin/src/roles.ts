import { COLLECTOR_TOPIC_FILTERS, STATION_PUBLISHED_KINDS, TOPIC_ROOT } from '@wx/shared';
import type { Acl, DynsecClient, DynsecCommand } from './dynsec';

// Roles of the system (design §3.10). The default ACL access denies publishing and subscribing,
// so each role lists exactly what its clients may do. `%u` is replaced by the MQTT username,
// which for stations is the station code.

export const ROLE_NAMES = {
  station: 'station',
  collector: 'collector',
  dashboardOps: 'dashboard-ops',
} as const;

export interface RoleDefinition {
  rolename: string;
  textname: string;
  acls: Acl[];
}

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    rolename: ROLE_NAMES.station,
    textname: 'Weather station',
    acls: [
      ...STATION_PUBLISHED_KINDS.map(
        (kind): Acl => ({
          acltype: 'publishClientSend',
          topic: `${TOPIC_ROOT}/%u/${kind}`,
          allow: true,
        }),
      ),
      { acltype: 'subscribePattern', topic: `${TOPIC_ROOT}/%u/config`, allow: true },
      { acltype: 'subscribePattern', topic: `${TOPIC_ROOT}/%u/cmd`, allow: true },
    ],
  },
  {
    rolename: ROLE_NAMES.collector,
    textname: 'Collector (App 1)',
    acls: [
      ...COLLECTOR_TOPIC_FILTERS.map(
        (topic): Acl => ({ acltype: 'subscribePattern', topic, allow: true }),
      ),
      { acltype: 'subscribePattern', topic: '$SYS/#', allow: true },
    ],
  },
  {
    rolename: ROLE_NAMES.dashboardOps,
    textname: 'Dashboard (App 2)',
    acls: [
      { acltype: 'publishClientSend', topic: `${TOPIC_ROOT}/+/config`, allow: true },
      { acltype: 'publishClientSend', topic: `${TOPIC_ROOT}/+/cmd`, allow: true },
      // Only used to clear the retained status of a deleted station.
      { acltype: 'publishClientSend', topic: `${TOPIC_ROOT}/+/status`, allow: true },
    ],
  },
];

export type RoleAction = 'created' | 'updated' | 'unchanged';

const aclKey = (acl: Pick<Acl, 'acltype' | 'topic'>) => `${acl.acltype} ${acl.topic}`;

/** Creates the role or reconciles its ACLs with the definition (adds missing, removes extra). */
export async function syncRole(
  dynsec: DynsecClient,
  definition: RoleDefinition,
): Promise<RoleAction> {
  const desired = definition.acls.map((acl) => ({ priority: 0, ...acl }));
  const existing = await dynsec.getRole(definition.rolename);

  if (!existing) {
    await dynsec.run({
      command: 'createRole',
      rolename: definition.rolename,
      textname: definition.textname,
      acls: desired,
    });
    return 'created';
  }

  const current = new Map((existing.acls ?? []).map((acl) => [aclKey(acl), acl]));
  const wanted = new Map(desired.map((acl) => [aclKey(acl), acl]));
  const commands: DynsecCommand[] = [];

  for (const [key, acl] of current) {
    const target = wanted.get(key);
    if (!target || target.allow !== acl.allow || target.priority !== (acl.priority ?? 0)) {
      commands.push({
        command: 'removeRoleACL',
        rolename: definition.rolename,
        acltype: acl.acltype,
        topic: acl.topic,
      });
    }
  }
  for (const [key, acl] of wanted) {
    const present = current.get(key);
    if (!present || present.allow !== acl.allow || (present.priority ?? 0) !== acl.priority) {
      commands.push({ command: 'addRoleACL', rolename: definition.rolename, ...acl });
    }
  }

  for (const command of commands) await dynsec.run(command);
  return commands.length === 0 ? 'unchanged' : 'updated';
}
