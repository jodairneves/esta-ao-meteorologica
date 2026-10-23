import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  commandBodySchema,
  createStationBodySchema,
  deleteStationBodySchema,
  deviceConfigBodySchema,
  updateStationBodySchema,
} from '../../common/api';
import type { AppDeps } from '../context';
import { parseInput } from '../http';
import { currentUser } from '../plugins/auth';
import { findStation, getStationDetail, listStationSummaries } from '../services/station-views';
import {
  createStation,
  deleteStation,
  getLocalPageAccess,
  listCommands,
  rotateCredentials,
  rotateLocalPassword,
  sendCommand,
  updateDeviceConfig,
  updateStation,
} from '../services/stations';

/** `:id` accepts the station uuid or its code. */
export const stationParams = z.object({ id: z.string().min(1).max(64) });
const admin = { config: { auth: 'admin' as const } };

export async function stationRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { db } = deps;
  const service = { db, broker: deps.broker, publicMqtt: deps.config.publicMqtt };

  app.get('/stations', () => listStationSummaries(db));

  app.get('/stations/:id', async (request) => {
    const { id } = parseInput(stationParams, request.params);
    return getStationDetail(db, id);
  });

  app.post('/stations', admin, async (request, reply) => {
    const body = parseInput(createStationBodySchema, request.body);
    reply.code(201);
    return createStation(service, body, currentUser(request));
  });

  app.patch('/stations/:id', admin, async (request) => {
    const { id } = parseInput(stationParams, request.params);
    const body = parseInput(updateStationBodySchema, request.body);
    return updateStation(service, id, body, currentUser(request));
  });

  app.delete('/stations/:id', admin, async (request, reply) => {
    const { id } = parseInput(stationParams, request.params);
    const { confirmCode } = parseInput(deleteStationBodySchema, request.body);
    await deleteStation(service, id, confirmCode, currentUser(request));
    return reply.code(204).send();
  });

  app.post('/stations/:id/credentials', admin, async (request) => {
    const { id } = parseInput(stationParams, request.params);
    return rotateCredentials(service, id, currentUser(request));
  });

  // Login of the configuration page the station serves on its local network.
  app.get('/stations/:id/local-access', admin, async (request) => {
    const { id } = parseInput(stationParams, request.params);
    return getLocalPageAccess(service, id, currentUser(request));
  });

  app.post('/stations/:id/local-access', admin, async (request) => {
    const { id } = parseInput(stationParams, request.params);
    return rotateLocalPassword(service, id, currentUser(request));
  });

  app.put('/stations/:id/device-config', admin, async (request) => {
    const { id } = parseInput(stationParams, request.params);
    const config = parseInput(deviceConfigBodySchema, request.body);
    return updateDeviceConfig(service, id, config, currentUser(request));
  });

  app.get('/stations/:id/commands', async (request) => {
    const { id } = parseInput(stationParams, request.params);
    const station = await findStation(db, id);
    return listCommands(db, station.id);
  });

  app.post('/stations/:id/commands', admin, async (request, reply) => {
    const { id } = parseInput(stationParams, request.params);
    const body = parseInput(commandBodySchema, request.body);
    reply.code(201);
    return sendCommand(service, id, body, currentUser(request));
  });
}
