import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { sql } from '@wx/db';
import Fastify, { type FastifyError, LogController } from 'fastify';
import { API_PREFIX, type ApiErrorBody } from '../common/api';
import type { AppDeps } from './context';
import { HttpError } from './http';
import { authPlugin } from './plugins/auth';
import { csrfPlugin } from './plugins/csrf';
import { authRoutes } from './routes/auth';
import { dataRoutes } from './routes/data';
import { operationRoutes } from './routes/operations';
import { stationRoutes } from './routes/stations';
import { streamRoutes } from './routes/stream';
import { userRoutes } from './routes/users';

/** External origins the SPA talks to: map tiles and the elevation lookup of the station form. */
const MAP_TILES = 'https://tiles.openfreemap.org';
const ELEVATION_API = 'https://api.open-meteo.com';

function errorBody(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export async function buildApp(deps: AppDeps) {
  const { config, logger, db } = deps;
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: config.trustProxy,
    bodyLimit: 256 * 1024,
    // Requests are logged by the onResponse hook below (debug level, errors at error).
    logController: new LogController({ disableRequestLogging: true }),
    // SSE connections would otherwise keep close() waiting.
    forceCloseConnections: true,
  });

  app.addHook('onResponse', async (request, reply) => {
    const level = reply.statusCode >= 500 ? 'error' : 'debug';
    logger[level](
      {
        method: request.method,
        url: request.url,
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      },
      'request',
    );
  });

  await app.register(fastifyCookie);
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', MAP_TILES],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", MAP_TILES, ELEVATION_API],
        workerSrc: ["'self'", 'blob:'],
        childSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.appUrl.protocol === 'https:' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(fastifyRateLimit, { global: false });
  await app.register(csrfPlugin, { allowedOrigin: config.appUrl.origin });
  await app.register(authPlugin, {
    db,
    policy: { ttlMs: config.session.ttlMs, rememberMs: config.session.rememberMs },
    secureCookie: config.session.secureCookie,
  });

  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send(errorBody(error.code, error.message, error.details));
    }
    const status = error.statusCode ?? 500;
    if (status === 429) {
      return reply
        .code(429)
        .send(errorBody('RATE_LIMITED', 'Muitas tentativas. Aguarde um minuto e tente novamente.'));
    }
    if (status === 413)
      return reply.code(413).send(errorBody('TOO_LARGE', 'Conteúdo grande demais'));
    if (status === 415) {
      return reply.code(415).send(errorBody('UNSUPPORTED', 'Formato de conteúdo não suportado'));
    }
    if (status >= 400 && status < 500) {
      return reply.code(status).send(errorBody('BAD_REQUEST', 'Requisição inválida'));
    }
    request.log.error({ err: error, url: request.url }, 'request failed');
    return reply.code(500).send(errorBody('INTERNAL', 'Erro interno do servidor'));
  });

  app.get('/healthz', { config: { auth: 'public' } }, async () => {
    await db.execute(sql`select 1`);
    return { ok: true, broker: deps.broker.connected };
  });

  await app.register(
    async (api) => {
      await authRoutes(api, deps);
      await userRoutes(api, deps);
      await stationRoutes(api, deps);
      await dataRoutes(api, deps);
      await operationRoutes(api, deps);
      await streamRoutes(api, deps);
    },
    { prefix: API_PREFIX },
  );

  if (config.webDist) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      wildcard: false,
      setHeaders: (reply, path) => {
        // Vite fingerprints everything under assets/: cache it forever, never index.html.
        reply.header(
          'cache-control',
          path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (config.webDist && request.method === 'GET' && !request.url.startsWith('/api/')) {
      // Client-side routes (/estacoes/sede…) are served the SPA shell.
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send(errorBody('NOT_FOUND', 'Rota não encontrada'));
  });

  return app;
}
