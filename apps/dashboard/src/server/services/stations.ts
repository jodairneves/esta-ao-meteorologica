import { randomInt, randomUUID } from 'node:crypto';
import {
  and,
  CHANNELS,
  commands,
  type Database,
  desc,
  type Executor,
  eq,
  notifyStatement,
  resolveAlerts,
  stationSensors,
  stationState,
  stations,
  users,
} from '@wx/db';
import { generatePassword } from '@wx/mqtt-admin';
import {
  type Command,
  DEFAULT_CALIBRATION,
  DEFAULT_DEVICE_CONFIG,
  DEFAULT_TIMEZONE,
  type DeviceConfig,
  PROTOCOL_VERSION,
  stationClientId,
  stationLabel,
  suggestStationCode,
} from '@wx/shared';
import type { z } from 'zod';
import type {
  CommandDto,
  CreateStationResponse,
  createStationBodySchema,
  LocalPageAccess,
  SessionUser,
  StationCredentials,
  StationDetail,
  updateStationBodySchema,
} from '../../common/api';
import type { DashboardConfig } from '../config';
import { badRequest, conflict } from '../http';
import { audit } from './audit';
import type { BrokerAdmin } from './broker';
import { findStation, getStationDetail, iso } from './station-views';

export interface StationServiceDeps {
  db: Database;
  broker: BrokerAdmin;
  publicMqtt: DashboardConfig['publicMqtt'];
}

type CreateInput = z.output<typeof createStationBodySchema>;
type UpdateInput = z.output<typeof updateStationBodySchema>;

function credentialsFor(
  deps: StationServiceDeps,
  code: string,
  password: string | null,
): StationCredentials {
  const sharedUsername = deps.broker.sharedUsername;
  return {
    username: sharedUsername ?? code,
    password,
    clientId: stationClientId(code),
    host: deps.publicMqtt.host,
    port: deps.publicMqtt.port,
    tls: deps.publicMqtt.tls,
    login: deps.broker.login,
  };
}

/** Username of the configuration page the station serves on its local network. */
export const LOCAL_PAGE_USERNAME = 'admin';

// No look-alike characters (0/o, 1/l/i): it is read on the station page and typed on a phone.
const LOCAL_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Password of the local configuration page, like "k7mp-9xq2-rt4w" (about 70 bits). */
export function generateLocalPassword(): string {
  const groups = Array.from({ length: 3 }, () =>
    Array.from(
      { length: 4 },
      () => LOCAL_PASSWORD_ALPHABET[randomInt(LOCAL_PASSWORD_ALPHABET.length)],
    ).join(''),
  );
  return groups.join('-');
}

const notifyChanged = (db: Executor, stationId: string) =>
  db.execute(notifyStatement(CHANNELS.stationChanged, { stationId }));

/** First free code derived from the name: "sede", "sede-2", "sede-3"… */
async function freeCode(db: Database, base: string): Promise<string> {
  for (let attempt = 1; attempt < 100; attempt++) {
    const suffix = attempt === 1 ? '' : `-${attempt}`;
    const candidate = `${base.slice(0, 32 - suffix.length).replace(/-+$/, '')}${suffix}`;
    const [taken] = await db
      .select({ id: stations.id })
      .from(stations)
      .where(eq(stations.code, candidate));
    if (!taken) return candidate;
  }
  throw conflict('Não foi possível gerar um código livre; informe um código', 'STATION_CODE_TAKEN');
}

/**
 * Registers a station: database row, MQTT credentials and retained configuration, all or
 * nothing (the MQTT steps run inside the transaction). The password is returned only here. With a
 * shared broker the station uses the broker's own login, so there is no password to create.
 */
export async function createStation(
  deps: StationServiceDeps,
  input: CreateInput,
  actor: SessionUser,
): Promise<CreateStationResponse> {
  const { db, broker } = deps;
  const code = input.code ?? (await freeCode(db, suggestStationCode(input.name)));
  const password = broker.login === 'station' ? generatePassword() : null;
  const localPassword = generateLocalPassword();

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(stations)
      .values({
        code,
        name: input.name,
        description: input.description ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        elevationM: input.elevationM ?? null,
        timezone: input.timezone ?? DEFAULT_TIMEZONE,
        climateSensor: input.climateSensor ?? 'bme280',
        rainMmPerTip: input.rainMmPerTip ?? DEFAULT_CALIBRATION.rainMmPerTip,
        windMsPerHz: input.windMsPerHz ?? DEFAULT_CALIBRATION.windMsPerHz,
        tempOffsetC: input.tempOffsetC ?? 0,
        humOffsetPct: input.humOffsetPct ?? 0,
        presOffsetHpa: input.presOffsetHpa ?? 0,
        deviceConfig: DEFAULT_DEVICE_CONFIG,
        mqttCredentialsSetAt: password ? new Date() : null,
        localPassword,
        createdBy: actor.id,
      })
      .onConflictDoNothing({ target: stations.code })
      .returning();
    if (!row) throw conflict(`Já existe uma estação com o código "${code}"`, 'STATION_CODE_TAKEN');

    await tx.insert(stationState).values({ stationId: row.id });
    if (password) await broker.provision(code, password);
    await broker.publishConfig(code, row.deviceConfigRev, row.deviceConfig, localPassword);
    await notifyChanged(tx, row.id);
    await audit(tx, {
      userId: actor.id,
      code: 'STATION_CREATED',
      message: `${stationLabel(row.name)} cadastrada (código ${code})`,
      stationId: row.id,
    });
    return row;
  });

  return {
    station: await getStationDetail(db, created.id),
    credentials: credentialsFor(deps, code, password),
  };
}

export async function updateStation(
  deps: StationServiceDeps,
  idOrCode: string,
  input: UpdateInput,
  actor: SessionUser,
): Promise<StationDetail> {
  const { db, broker } = deps;
  const station = await findStation(db, idOrCode);

  await db.transaction(async (tx) => {
    await tx
      .update(stations)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(stations.id, station.id));
    // A shared login cannot be blocked for one station: the collector ignores its data instead.
    if (
      broker.login === 'station' &&
      input.isActive !== undefined &&
      input.isActive !== station.isActive
    ) {
      await broker.setEnabled(station.code, input.isActive);
    }
    const versionChanged =
      input.climateSensor !== undefined && input.climateSensor !== station.climateSensor;
    if (versionChanged) {
      // The previous climate sensor is gone: its status row and alerts would only mislead.
      await tx
        .delete(stationSensors)
        .where(
          and(
            eq(stationSensors.stationId, station.id),
            eq(stationSensors.sensor, station.climateSensor),
          ),
        );
      await resolveAlerts(tx, {
        stationId: station.id,
        type: ['sensor_stale', 'sensor_error'],
        subject: station.climateSensor,
      });
    }
    await notifyChanged(tx, station.id);
    const label = stationLabel(station.name);
    await audit(tx, {
      userId: actor.id,
      code: 'STATION_UPDATED',
      message:
        input.isActive !== undefined && input.isActive !== station.isActive
          ? `${label} ${input.isActive ? 'reativada' : 'desativada'}`
          : versionChanged
            ? `${label} passou para a versão ${input.climateSensor === 'htu21d' ? 'HTU21D' : 'BME280'}`
            : `${label} atualizada`,
      stationId: station.id,
      details: { changes: input },
    });
  });

  return getStationDetail(db, station.id);
}

/** Deletes the station and its data. The caller must type the station code to confirm. */
export async function deleteStation(
  deps: StationServiceDeps,
  idOrCode: string,
  confirmCode: string,
  actor: SessionUser,
): Promise<void> {
  const { db, broker } = deps;
  const station = await findStation(db, idOrCode);
  if (confirmCode !== station.code) {
    throw badRequest('Digite o código da estação para confirmar a exclusão');
  }

  await db.transaction(async (tx) => {
    await tx.delete(stations).where(eq(stations.id, station.id));
    await broker.remove(station.code);
    await notifyChanged(tx, station.id);
    await audit(tx, {
      userId: actor.id,
      level: 'warn',
      code: 'STATION_DELETED',
      message: `${stationLabel(station.name)} (código ${station.code}) excluída com todos os dados`,
      details: { code: station.code, name: station.name },
    });
  });
}

/** Issues a new MQTT password (the old one stops working immediately). */
export async function rotateCredentials(
  deps: StationServiceDeps,
  idOrCode: string,
  actor: SessionUser,
): Promise<StationCredentials> {
  const { db, broker } = deps;
  if (broker.login === 'shared') {
    throw conflict(
      'Com o broker compartilhado, as estações usam a senha do próprio broker: troque-a no broker',
      'SHARED_BROKER_LOGIN',
    );
  }
  const station = await findStation(db, idOrCode);
  const password = generatePassword();

  await db.transaction(async (tx) => {
    await tx
      .update(stations)
      .set({ mqttCredentialsSetAt: new Date() })
      .where(eq(stations.id, station.id));
    await broker.provision(station.code, password);
    if (!station.isActive) await broker.setEnabled(station.code, false);
    await audit(tx, {
      userId: actor.id,
      code: 'CREDENTIALS_ROTATED',
      message: `Nova senha MQTT gerada para a ${stationLabel(station.name)}`,
      stationId: station.id,
    });
  });

  return credentialsFor(deps, station.code, password);
}

/** New desired configuration: bumps the revision and publishes it retained. */
export async function updateDeviceConfig(
  deps: StationServiceDeps,
  idOrCode: string,
  config: DeviceConfig,
  actor: SessionUser,
): Promise<StationDetail> {
  const { db, broker } = deps;
  const station = await findStation(db, idOrCode);
  const rev = station.deviceConfigRev + 1;

  await db.transaction(async (tx) => {
    await tx
      .update(stations)
      .set({ deviceConfig: config, deviceConfigRev: rev, updatedAt: new Date() })
      .where(eq(stations.id, station.id));
    await broker.publishConfig(station.code, rev, config, station.localPassword);
    await notifyChanged(tx, station.id);
    await audit(tx, {
      userId: actor.id,
      code: 'CONFIG_PUSHED',
      category: 'audit',
      message: `Configuração rev ${rev} enviada para a ${stationLabel(station.name)}`,
      stationId: station.id,
      details: { rev, config },
    });
  });

  return getStationDetail(db, station.id);
}

/** Login of the station's local configuration page; looking it up is audited. */
export async function getLocalPageAccess(
  deps: StationServiceDeps,
  idOrCode: string,
  actor: SessionUser,
): Promise<LocalPageAccess> {
  const { db } = deps;
  const station = await findStation(db, idOrCode);
  if (station.localPassword) {
    await audit(db, {
      userId: actor.id,
      code: 'LOCAL_PASSWORD_VIEWED',
      category: 'audit',
      message: `Senha da página local da ${stationLabel(station.name)} exibida`,
      stationId: station.id,
    });
  }
  return { username: LOCAL_PAGE_USERNAME, password: station.localPassword };
}

/**
 * New password for the local configuration page. It reaches the station inside the retained
 * configuration (new revision); until then the station keeps accepting the previous one.
 */
export async function rotateLocalPassword(
  deps: StationServiceDeps,
  idOrCode: string,
  actor: SessionUser,
): Promise<LocalPageAccess> {
  const { db, broker } = deps;
  const station = await findStation(db, idOrCode);
  const localPassword = generateLocalPassword();
  const rev = station.deviceConfigRev + 1;

  await db.transaction(async (tx) => {
    await tx
      .update(stations)
      .set({ localPassword, deviceConfigRev: rev, updatedAt: new Date() })
      .where(eq(stations.id, station.id));
    await broker.publishConfig(station.code, rev, station.deviceConfig, localPassword);
    await notifyChanged(tx, station.id);
    await audit(tx, {
      userId: actor.id,
      code: 'LOCAL_PASSWORD_ROTATED',
      category: 'audit',
      message: `Nova senha da página local gerada para a ${stationLabel(station.name)} (configuração rev ${rev})`,
      stationId: station.id,
      details: { rev },
    });
  });

  return { username: LOCAL_PAGE_USERNAME, password: localPassword };
}

const COMMAND_LABELS: Record<Command, string> = {
  reboot: 'reiniciar',
  identify: 'identificar (piscar o LED)',
  flush: 'enviar o buffer agora',
  health: 'enviar diagnóstico agora',
};

export async function sendCommand(
  deps: StationServiceDeps,
  idOrCode: string,
  input: { command: Command; ttlMinutes: number },
  actor: SessionUser,
): Promise<CommandDto> {
  const { db, broker } = deps;
  const station = await findStation(db, idOrCode);
  if (!station.isActive) throw badRequest('A estação está desativada');

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + input.ttlMinutes * 60_000);

  await db.transaction(async (tx) => {
    await tx.insert(commands).values({
      id,
      stationId: station.id,
      command: input.command,
      expiresAt,
      createdBy: actor.id,
    });
    await broker.publishCommand(station.code, {
      v: PROTOCOL_VERSION,
      id,
      cmd: input.command,
      exp: Math.floor(expiresAt.getTime() / 1000),
      args: {},
    });
    await audit(tx, {
      userId: actor.id,
      code: 'COMMAND_SENT',
      message: `Comando "${COMMAND_LABELS[input.command]}" enviado para a ${stationLabel(station.name)}`,
      stationId: station.id,
      details: { commandId: id, command: input.command },
    });
  });

  const [created] = await listCommands(db, station.id, 1);
  if (!created) throw new Error('command not stored');
  return created;
}

export async function listCommands(
  db: Database,
  stationId: string,
  limit = 50,
): Promise<CommandDto[]> {
  const rows = await db
    .select({ command: commands, createdBy: users.email })
    .from(commands)
    .leftJoin(users, eq(users.id, commands.createdBy))
    .where(eq(commands.stationId, stationId))
    .orderBy(desc(commands.createdAt))
    .limit(limit);
  return rows.map(({ command, createdBy }) => ({
    id: command.id,
    command: command.command,
    status:
      command.status === 'sent' && command.expiresAt < new Date() ? 'expired' : command.status,
    createdAt: command.createdAt.toISOString(),
    expiresAt: command.expiresAt.toISOString(),
    ackedAt: iso(command.ackedAt),
    createdBy,
    result: command.result,
  }));
}
