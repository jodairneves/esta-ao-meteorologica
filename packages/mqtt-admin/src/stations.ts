import { stationClientId, stationTopic } from '@wx/shared';
import type { MqttClient } from 'mqtt';
import { type ClientAction, deleteClient, ensureClient } from './clients';
import { type DynsecClient, DynsecError } from './dynsec';
import { ROLE_NAMES } from './roles';

// MQTT credentials of a station: username = station code, client id = st-{code}.

/** Creates (or resets) the station's MQTT client with the given password. */
export async function provisionStation(
  dynsec: DynsecClient,
  code: string,
  password: string,
): Promise<ClientAction> {
  return ensureClient(dynsec, {
    username: code,
    password,
    clientid: stationClientId(code),
    textname: `Station ${code}`,
    roles: [ROLE_NAMES.station],
  });
}

export async function rotateStationPassword(
  dynsec: DynsecClient,
  code: string,
  password: string,
): Promise<void> {
  if (!(await dynsec.getClient(code))) {
    throw new DynsecError('setClientPassword', `station "${code}" has no MQTT client`);
  }
  await dynsec.run({ command: 'setClientPassword', username: code, password });
}

/** A disabled station cannot connect (and is disconnected if connected). */
export async function setStationEnabled(
  dynsec: DynsecClient,
  code: string,
  enabled: boolean,
): Promise<void> {
  await dynsec.run({ command: enabled ? 'enableClient' : 'disableClient', username: code });
}

/**
 * Deletes the station's MQTT client and clears its retained topics (status and config), so a
 * future station with the same code starts clean. `mqtt` must be allowed to publish there.
 */
export async function removeStation(
  dynsec: DynsecClient,
  mqtt: MqttClient,
  code: string,
): Promise<void> {
  await deleteClient(dynsec, code);
  for (const kind of ['status', 'config'] as const) {
    await mqtt.publishAsync(stationTopic(code, kind), '', { qos: 1, retain: true });
  }
}
