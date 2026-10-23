import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createUserBodySchema, updateUserBodySchema } from '../../common/api';
import type { AppDeps } from '../context';
import { parseInput } from '../http';
import { currentUser } from '../plugins/auth';
import { createUser, deleteUser, listUsers, resetPassword, updateUser } from '../services/users';

const idParams = z.object({ id: z.uuid('Identificador inválido') });
const admin = { config: { auth: 'admin' as const } };

export async function userRoutes(app: FastifyInstance, { db }: AppDeps): Promise<void> {
  app.get('/users', admin, () => listUsers(db));

  app.post('/users', admin, async (request, reply) => {
    const body = parseInput(createUserBodySchema, request.body);
    reply.code(201);
    return createUser(db, body, currentUser(request));
  });

  app.patch('/users/:id', admin, async (request) => {
    const { id } = parseInput(idParams, request.params);
    return updateUser(db, id, parseInput(updateUserBodySchema, request.body), currentUser(request));
  });

  app.post('/users/:id/reset-password', admin, async (request) => {
    const { id } = parseInput(idParams, request.params);
    return resetPassword(db, id, currentUser(request));
  });

  app.delete('/users/:id', admin, async (request, reply) => {
    const { id } = parseInput(idParams, request.params);
    await deleteUser(db, id, currentUser(request));
    return reply.code(204).send();
  });
}
