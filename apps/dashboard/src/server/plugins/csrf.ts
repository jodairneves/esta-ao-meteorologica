import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { CSRF_HEADER } from '../../common/api';
import { HttpError } from '../http';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence in depth, on top of SameSite=Strict cookies: state-changing API calls must carry
 * a custom header (a cross-site form cannot set one, and a cross-site fetch with it needs a CORS
 * preflight we never grant) and, when the browser sends an Origin, it must be ours.
 */
export const csrfPlugin = fp<{ allowedOrigin: string }>(async (app: FastifyInstance, options) => {
  app.addHook('onRequest', async (request) => {
    if (!UNSAFE_METHODS.has(request.method) || !request.url.startsWith('/api/')) return;
    const origin = request.headers.origin;
    if (request.headers[CSRF_HEADER] !== '1' || (origin && origin !== options.allowedOrigin)) {
      throw new HttpError(403, 'CSRF', 'Requisição recusada por segurança; recarregue a página');
    }
  });
});
