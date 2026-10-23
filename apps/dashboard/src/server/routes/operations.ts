import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  alertsQuerySchema,
  logsQuerySchema,
  rangeQuerySchema,
  updateSettingsBodySchema,
} from '../../common/api';
import type { AppDeps } from '../context';
import { parseInput } from '../http';
import { currentUser } from '../plugins/auth';
import {
  acknowledgeAlert,
  getConnectionEvents,
  getSystemStatus,
  listDevices,
  pageAlerts,
  pageLogs,
  readSettings,
  writeSettings,
} from '../services/operations';
import { getHealthSeries, resolveRange } from '../services/readings';
import { findStation, listSensors } from '../services/station-views';
import { stationParams } from './stations';

const DAY_MS = 86_400_000;

export async function operationRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { db } = deps;

  // ---- devices -----------------------------------------------------------------------
  app.get('/devices', () => listDevices(db));

  app.get('/stations/:id/health', async (request) => {
    const { id } = parseInput(stationParams, request.params);
    const station = await findStation(db, id);
    return getHealthSeries(
      db,
      station.id,
      resolveRange(parseInput(rangeQuerySchema, request.query), 7 * DAY_MS),
    );
  });

  app.get('/stations/:id/connection', async (request) => {
    const { id } = parseInput(stationParams, request.params);
    const station = await findStation(db, id);
    const range = resolveRange(parseInput(rangeQuerySchema, request.query), 7 * DAY_MS);
    return getConnectionEvents(db, station.id, range);
  });

  app.get('/stations/:id/sensors', async (request) => {
    const { id } = parseInput(stationParams, request.params);
    return listSensors(db, (await findStation(db, id)).id);
  });

  // ---- alerts and logs ---------------------------------------------------------------
  app.get('/alerts', async (request) =>
    pageAlerts(db, parseInput(alertsQuerySchema, request.query)),
  );

  app.post('/alerts/:id/ack', async (request) => {
    const { id } = parseInput(z.object({ id: z.coerce.number().int().positive() }), request.params);
    return acknowledgeAlert(db, id, currentUser(request));
  });

  app.get('/logs', async (request) => pageLogs(db, parseInput(logsQuerySchema, request.query)));

  // ---- system ------------------------------------------------------------------------
  app.get('/system/status', () =>
    getSystemStatus(db, deps.broker, {
      version: deps.version,
      startedAt: deps.startedAt,
      sseClients: deps.hub.size,
    }),
  );

  app.get('/settings', () => readSettings(db));

  app.put('/settings', { config: { auth: 'admin' } }, async (request) =>
    writeSettings(db, parseInput(updateSettingsBodySchema, request.body), currentUser(request)),
  );
}
