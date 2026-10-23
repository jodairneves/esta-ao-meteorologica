import { randomUUID } from 'node:crypto';
import type { MqttClient } from 'mqtt';

// Client for the Mosquitto Dynamic Security control API. Commands are published as
// {"commands":[...]} on $CONTROL/dynamic-security/v1; the broker answers on .../response with
// {"responses":[...]} in the same order, echoing each command's correlationData.

export const DYNSEC_TOPIC = '$CONTROL/dynamic-security/v1';
export const DYNSEC_RESPONSE_TOPIC = `${DYNSEC_TOPIC}/response`;

export type AclType =
  | 'publishClientSend'
  | 'publishClientReceive'
  | 'subscribeLiteral'
  | 'subscribePattern'
  | 'unsubscribeLiteral'
  | 'unsubscribePattern';

export interface Acl {
  acltype: AclType;
  topic: string;
  allow: boolean;
  priority?: number;
}

export interface RoleRef {
  rolename: string;
  priority?: number;
}

export type DefaultAclType =
  | 'publishClientSend'
  | 'publishClientReceive'
  | 'subscribe'
  | 'unsubscribe';

export type DynsecCommand =
  | {
      command: 'createClient';
      username: string;
      password: string;
      clientid?: string;
      textname?: string;
      roles?: RoleRef[];
    }
  | { command: 'deleteClient'; username: string }
  | { command: 'enableClient'; username: string }
  | { command: 'disableClient'; username: string }
  | { command: 'setClientPassword'; username: string; password: string }
  | { command: 'setClientId'; username: string; clientid?: string }
  | { command: 'addClientRole'; username: string; rolename: string; priority?: number }
  | { command: 'removeClientRole'; username: string; rolename: string }
  | { command: 'getClient'; username: string }
  | {
      command: 'createRole';
      rolename: string;
      textname?: string;
      acls?: Acl[];
      allowwildcardsubs?: boolean;
    }
  | { command: 'getRole'; rolename: string }
  | { command: 'deleteRole'; rolename: string }
  | ({ command: 'addRoleACL'; rolename: string } & Acl)
  | { command: 'removeRoleACL'; rolename: string; acltype: AclType; topic: string }
  | { command: 'setDefaultACLAccess'; acls: { acltype: DefaultAclType; allow: boolean }[] };

export interface DynsecResponse {
  command: string;
  error?: string;
  data?: unknown;
  correlationData?: string;
}

export interface DynsecClientInfo {
  username: string;
  clientid?: string;
  disabled?: boolean;
  roles?: RoleRef[];
  connections?: unknown[];
}

export interface DynsecRoleInfo {
  rolename: string;
  allowwildcardsubs?: boolean;
  acls?: Acl[];
}

/** Error strings returned by the broker that callers commonly need to recognise. */
export const DYNSEC_ERRORS = {
  clientNotFound: 'Client not found',
  roleNotFound: 'Role not found',
  clientExists: 'Client already exists',
  roleExists: 'Role already exists',
} as const;

export class DynsecError extends Error {
  constructor(
    readonly command: string,
    readonly reason: string,
  ) {
    super(`Dynamic Security ${command} failed: ${reason}`);
    this.name = 'DynsecError';
  }
}

interface PendingBatch {
  resolve: (responses: DynsecResponse[]) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class DynsecClient {
  private readonly pending = new Map<string, PendingBatch>();
  private subscribed: Promise<unknown> | null = null;

  constructor(
    private readonly mqtt: MqttClient,
    private readonly timeoutMs = 5000,
  ) {
    mqtt.on('message', this.handleMessage);
  }

  /** Sends a batch of commands and resolves with the broker responses, in order. */
  async execute(commands: DynsecCommand[]): Promise<DynsecResponse[]> {
    this.subscribed ??= this.mqtt.subscribeAsync(DYNSEC_RESPONSE_TOPIC, { qos: 1 });
    await this.subscribed;

    const batchId = randomUUID();
    const payload = JSON.stringify({
      commands: commands.map((command, index) => ({
        ...command,
        correlationData: `${batchId}:${index}`,
      })),
    });

    return new Promise<DynsecResponse[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(batchId);
        reject(new Error('Dynamic Security did not answer in time'));
      }, this.timeoutMs);
      this.pending.set(batchId, { resolve, reject, timer });
      this.mqtt.publishAsync(DYNSEC_TOPIC, payload, { qos: 1 }).catch((error: Error) => {
        clearTimeout(timer);
        this.pending.delete(batchId);
        reject(error);
      });
    });
  }

  /** Runs one command; broker errors throw unless listed in `ignore`. Returns the `data` field. */
  async run(command: DynsecCommand, ignore: readonly string[] = []): Promise<unknown> {
    const [response] = await this.execute([command]);
    if (!response) throw new DynsecError(command.command, 'no response');
    if (response.error && !ignore.includes(response.error)) {
      throw new DynsecError(command.command, response.error);
    }
    return response.data;
  }

  async getClient(username: string): Promise<DynsecClientInfo | null> {
    const data = (await this.run({ command: 'getClient', username }, [
      DYNSEC_ERRORS.clientNotFound,
    ])) as { client?: DynsecClientInfo } | undefined;
    return data?.client ?? null;
  }

  async getRole(rolename: string): Promise<DynsecRoleInfo | null> {
    const data = (await this.run({ command: 'getRole', rolename }, [DYNSEC_ERRORS.roleNotFound])) as
      | { role?: DynsecRoleInfo }
      | undefined;
    return data?.role ?? null;
  }

  /** Stops listening for responses and fails pending calls. Does not close the MQTT client. */
  dispose(): void {
    this.mqtt.off('message', this.handleMessage);
    for (const [batchId, batch] of this.pending) {
      clearTimeout(batch.timer);
      batch.reject(new Error('Dynamic Security client disposed'));
      this.pending.delete(batchId);
    }
  }

  private readonly handleMessage = (topic: string, payload: Buffer) => {
    if (topic !== DYNSEC_RESPONSE_TOPIC) return;
    let responses: DynsecResponse[];
    try {
      responses =
        (JSON.parse(payload.toString('utf8')) as { responses?: DynsecResponse[] }).responses ?? [];
    } catch {
      return;
    }
    // Responses to other clients' batches (e.g. another dashboard instance) are ignored.
    const batchId = responses[0]?.correlationData?.split(':')[0];
    const batch = batchId ? this.pending.get(batchId) : undefined;
    if (!batchId || !batch) return;
    clearTimeout(batch.timer);
    this.pending.delete(batchId);
    batch.resolve(responses);
  };
}
