// pnpm mqtt:bootstrap — idempotent broker setup (roles, collector client, dashboard permissions).
import { bootstrapBroker } from './bootstrap';
import { connectAdmin } from './connect';
import { DynsecClient } from './dynsec';

const required = ['MQTT_URL', 'MOSQUITTO_DYNSEC_PASSWORD', 'MQTT_COLLECTOR_PASSWORD'] as const;
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Variáveis ausentes: ${missing.join(', ')}. Copie .env.example para .env.`);
  process.exit(1);
}

const adminUsername = process.env.MQTT_ADMIN_USERNAME ?? 'admin';
const client = await connectAdmin({
  url: process.env.MQTT_URL as string,
  username: adminUsername,
  password: process.env.MOSQUITTO_DYNSEC_PASSWORD as string,
  reconnectPeriodMs: 0,
});
const dynsec = new DynsecClient(client);

try {
  const report = await bootstrapBroker(dynsec, {
    collectorPassword: process.env.MQTT_COLLECTOR_PASSWORD as string,
    adminUsername,
  });
  console.log('Broker configurado:');
  for (const [role, action] of Object.entries(report.roles)) {
    console.log(`  papel ${role}: ${action}`);
  }
  console.log(`  cliente collector: ${report.collector}`);
  console.log(
    `  papéis adicionados ao ${adminUsername}: ${report.adminRolesAdded.join(', ') || 'nenhum'}`,
  );
} finally {
  dynsec.dispose();
  await client.endAsync();
}
