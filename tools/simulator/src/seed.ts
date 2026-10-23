// pnpm db:seed — creates the demo stations (database + MQTT credentials + retained config) and
// writes tools/simulator/.stations.json for the simulator. Safe to run again: it updates the
// stations and issues new passwords.
import {
  CHANNELS,
  createDb,
  createPool,
  eq,
  notifyStatement,
  prepareDatabase,
  stationState,
  stations,
} from '@wx/db';
import {
  bootstrapBroker,
  connectAdmin,
  DynsecClient,
  generatePassword,
  provisionStation,
} from '@wx/mqtt-admin';
import { DEFAULT_DEVICE_CONFIG, stationTopic } from '@wx/shared';
import { DEMO_STATIONS } from './demo-stations';
import { STATIONS_FILE, type StationCredentials, writeStationsFile } from './stations-file';

const required = [
  'DATABASE_URL',
  'MQTT_URL',
  'MOSQUITTO_DYNSEC_PASSWORD',
  'MQTT_COLLECTOR_PASSWORD',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Variáveis ausentes: ${missing.join(', ')}. Copie .env.example para .env.`);
  process.exit(1);
}
const env = (name: string) => process.env[name] as string;

const pool = createPool(env('DATABASE_URL'), { max: 2, applicationName: 'wx-seed' });
const db = createDb(pool);
const mqtt = await connectAdmin({
  url: env('MQTT_URL'),
  username: process.env.MQTT_ADMIN_USERNAME ?? 'admin',
  password: env('MOSQUITTO_DYNSEC_PASSWORD'),
  reconnectPeriodMs: 0,
});
const dynsec = new DynsecClient(mqtt);

try {
  await prepareDatabase(pool);
  await bootstrapBroker(dynsec, { collectorPassword: env('MQTT_COLLECTOR_PASSWORD') });

  const credentials: StationCredentials[] = [];
  for (const demo of DEMO_STATIONS) {
    const metadata = {
      name: demo.name,
      description: demo.description,
      latitude: demo.latitude,
      longitude: demo.longitude,
      elevationM: demo.elevationM,
      timezone: demo.timezone,
      rainMmPerTip: demo.rainMmPerTip,
      windMsPerHz: demo.windMsPerHz,
    };
    const [station] = await db
      .insert(stations)
      .values({ code: demo.code, deviceConfig: DEFAULT_DEVICE_CONFIG, ...metadata })
      .onConflictDoUpdate({ target: stations.code, set: { ...metadata, updatedAt: new Date() } })
      .returning();
    if (!station) throw new Error(`could not upsert station ${demo.code}`);
    await db.insert(stationState).values({ stationId: station.id }).onConflictDoNothing();

    const password = generatePassword();
    await provisionStation(dynsec, demo.code, password);
    await mqtt.publishAsync(
      stationTopic(demo.code, 'config'),
      JSON.stringify({ v: 1, rev: station.deviceConfigRev, ...station.deviceConfig }),
      { qos: 1, retain: true },
    );
    await db
      .update(stations)
      .set({ mqttCredentialsSetAt: new Date() })
      .where(eq(stations.id, station.id));
    await db.execute(notifyStatement(CHANNELS.stationChanged, { stationId: station.id }));

    credentials.push({ ...demo, password });
    console.log(`  ✓ ${demo.code.padEnd(12)} ${demo.name}`);
  }

  writeStationsFile({
    mqttUrl: env('MQTT_URL'),
    createdAt: new Date().toISOString(),
    stations: credentials,
  });
  console.log(`\nCredenciais do simulador gravadas em ${STATIONS_FILE}`);
  console.log('Próximos passos: pnpm dev:collector  e  pnpm simulate --backfill 7d');
} finally {
  dynsec.dispose();
  await mqtt.endAsync();
  await pool.end();
}
