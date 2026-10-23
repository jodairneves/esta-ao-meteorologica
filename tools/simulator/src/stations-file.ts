import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { simulatedStationSchema } from './demo-stations';

/** Written by `pnpm db:seed`; holds MQTT passwords, so it is git-ignored. */
export const STATIONS_FILE = fileURLToPath(new URL('../.stations.json', import.meta.url));

const stationsFileSchema = z.object({
  mqttUrl: z.string().min(1),
  createdAt: z.string(),
  stations: z.array(simulatedStationSchema.extend({ password: z.string().min(1) })),
});
export type StationsFile = z.infer<typeof stationsFileSchema>;
export type StationCredentials = StationsFile['stations'][number];

export function readStationsFile(): StationsFile {
  if (!existsSync(STATIONS_FILE)) {
    throw new Error('Arquivo de estações não encontrado. Rode "pnpm db:seed" primeiro.');
  }
  return stationsFileSchema.parse(JSON.parse(readFileSync(STATIONS_FILE, 'utf8')));
}

export function writeStationsFile(data: StationsFile): void {
  writeFileSync(STATIONS_FILE, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}
