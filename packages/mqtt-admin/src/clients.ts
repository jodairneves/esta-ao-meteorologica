import { DYNSEC_ERRORS, type DynsecClient, type DynsecCommand } from './dynsec';

export interface ClientSpec {
  username: string;
  /** Always applied, so the broker matches the configured password. */
  password: string;
  /** When set, the broker only accepts connections using this client id. */
  clientid?: string;
  textname?: string;
  roles: readonly string[];
}

export type ClientAction = 'created' | 'updated';

/** Creates the client or brings an existing one in line with the spec (password, id, roles, enabled). */
export async function ensureClient(dynsec: DynsecClient, spec: ClientSpec): Promise<ClientAction> {
  const existing = await dynsec.getClient(spec.username);

  if (!existing) {
    await dynsec.run({
      command: 'createClient',
      username: spec.username,
      password: spec.password,
      clientid: spec.clientid,
      textname: spec.textname,
      roles: spec.roles.map((rolename) => ({ rolename })),
    });
    return 'created';
  }

  const commands: DynsecCommand[] = [
    { command: 'setClientPassword', username: spec.username, password: spec.password },
  ];
  if (spec.clientid !== undefined && existing.clientid !== spec.clientid) {
    commands.push({ command: 'setClientId', username: spec.username, clientid: spec.clientid });
  }
  const currentRoles = new Set((existing.roles ?? []).map((role) => role.rolename));
  for (const rolename of spec.roles) {
    if (!currentRoles.has(rolename)) {
      commands.push({ command: 'addClientRole', username: spec.username, rolename });
    }
  }
  if (existing.disabled) commands.push({ command: 'enableClient', username: spec.username });

  for (const command of commands) await dynsec.run(command);
  return 'updated';
}

/** Adds roles to an existing client, skipping the ones it already has. */
export async function ensureClientRoles(
  dynsec: DynsecClient,
  username: string,
  roles: readonly string[],
): Promise<string[]> {
  const existing = await dynsec.getClient(username);
  if (!existing) throw new Error(`MQTT client "${username}" does not exist`);
  const currentRoles = new Set((existing.roles ?? []).map((role) => role.rolename));
  const added: string[] = [];
  for (const rolename of roles) {
    if (currentRoles.has(rolename)) continue;
    await dynsec.run({ command: 'addClientRole', username, rolename });
    added.push(rolename);
  }
  return added;
}

export async function deleteClient(dynsec: DynsecClient, username: string): Promise<boolean> {
  const existed = await dynsec.getClient(username);
  if (!existed) return false;
  await dynsec.run({ command: 'deleteClient', username }, [DYNSEC_ERRORS.clientNotFound]);
  return true;
}
