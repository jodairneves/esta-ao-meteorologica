// pnpm simulate [--backfill 7d] [--interval 10] [--chaos [--chaos-rate 5]] [--only sede,pivo-norte]
import { parseArgs } from 'node:util';
import { createDb, createPool, eq, inArray, max, readings, stations } from '@wx/db';
import { readStationsFile } from './stations-file';
import { VirtualStation } from './virtual-station';

const HELP = `Estações virtuais publicando no MQTT conforme o contrato v1.

Uso: pnpm simulate [opções]
  --backfill <duração>   publica o histórico antes de seguir em tempo real (ex.: 12h, 7d; máx. 29d)
  --interval <segundos>  sobrescreve o intervalo de leitura (ex.: 10 para ver dados mais rápido)
  --chaos                injeta falhas: sensor, Wi-Fi, falta de energia, duplicatas, payload inválido
  --chaos-rate <n>       multiplica a probabilidade das falhas (padrão 1)
  --only <códigos>       simula só as estações indicadas (separadas por vírgula)`;

const { values } = parseArgs({
  options: {
    backfill: { type: 'string' },
    interval: { type: 'string' },
    chaos: { type: 'boolean', default: false },
    'chaos-rate': { type: 'string' },
    only: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

const DAY_MS = 86_400_000;

function parseDuration(text: string): number {
  const match = /^(\d+)\s*(m|h|d)$/.exec(text.trim());
  if (!match) throw new Error(`Duração inválida: "${text}" (use 30m, 12h ou 7d)`);
  const unit = { m: 60_000, h: 3_600_000, d: DAY_MS }[match[2] as 'm' | 'h' | 'd'];
  return Math.min(Number(match[1]) * unit, 29 * DAY_MS);
}

const time = () => new Date().toLocaleTimeString('pt-BR');
const log = (code: string, message: string) =>
  console.log(`[${time()}] ${code.padEnd(12)} ${message}`);

/** Latest stored reading per station, so a repeated backfill does not overlap existing data. */
async function latestReadings(codes: string[]): Promise<Map<string, Date>> {
  const url = process.env.DATABASE_URL;
  if (!url) return new Map();
  const pool = createPool(url, { max: 1, applicationName: 'wx-simulator', onError: () => {} });
  try {
    const rows = await createDb(pool)
      .select({ code: stations.code, last: max(readings.ts) })
      .from(readings)
      .innerJoin(stations, eq(stations.id, readings.stationId))
      .where(inArray(stations.code, codes))
      .groupBy(stations.code);
    return new Map(rows.flatMap((row) => (row.last ? [[row.code, row.last] as const] : [])));
  } catch (error) {
    console.warn(`Aviso: não consegui consultar o banco (${(error as Error).message}).`);
    return new Map();
  } finally {
    await pool.end();
  }
}

const file = readStationsFile();
const only = values.only?.split(',').map((code) => code.trim());
const selected = file.stations.filter((station) => !only || only.includes(station.code));
if (selected.length === 0) {
  console.error('Nenhuma estação selecionada.');
  process.exit(1);
}

const intervalOverrideS = values.interval ? Number(values.interval) : undefined;
const chaos = values.chaos ? Number(values['chaos-rate'] ?? 1) : 0;
const fleet = selected.map(
  (def) =>
    new VirtualStation(def, {
      mqttUrl: process.env.MQTT_URL ?? file.mqttUrl,
      intervalOverrideS,
      chaos,
      log,
    }),
);

if (values.backfill) {
  const span = parseDuration(values.backfill);
  const now = Date.now();
  const latest = await latestReadings(selected.map((station) => station.code));
  console.log(`Publicando histórico de até ${values.backfill}…`);
  await Promise.all(
    fleet.map(async (station) => {
      const last = latest.get(station.code)?.getTime() ?? 0;
      const from = Math.max(now - span, last + 60_000);
      if (from >= now) {
        log(station.code, 'histórico já existe; nada a publicar');
        return;
      }
      const count = await station.backfill(from, now);
      log(station.code, `${count} leituras históricas publicadas`);
    }),
  );
}

const controller = new AbortController();
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log('\nEncerrando estações virtuais…');
  controller.abort();
  await Promise.all(fleet.map((station) => station.stop()));
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

console.log(
  `Simulando ${fleet.length} estação(ões) em tempo real${chaos ? ` com falhas (×${chaos})` : ''}. Ctrl+C para parar.`,
);
await Promise.all(fleet.map((station) => station.runLive(controller.signal)));
