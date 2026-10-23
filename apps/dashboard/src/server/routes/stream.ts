import type { FastifyInstance } from 'fastify';
import { resolveSession, SESSION_COOKIE } from '../auth/sessions';
import type { AppDeps } from '../context';
import type { StreamClient } from '../services/events';

/** The session is re-checked every few pings, so a logout also ends the stream. */
const SESSION_CHECK_EVERY_PINGS = 5;

/** Server-sent events: readings, station state, alerts and logs as they happen (design §8.6). */
export async function streamRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const policy = {
    ttlMs: deps.config.session.ttlMs,
    rememberMs: deps.config.session.rememberMs,
  };

  app.get('/stream', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE] ?? '';
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Proxies (nginx, Traefik) must not buffer the stream.
      'x-accel-buffering': 'no',
    });
    response.write('retry: 5000\n\n');

    let pings = 0;
    let removeClient = () => {};
    const close = () => {
      removeClient();
      response.end();
    };

    const client: StreamClient = {
      send(event) {
        response.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      },
      ping() {
        response.write(': ping\n\n');
        if (++pings % SESSION_CHECK_EVERY_PINGS !== 0) return;
        resolveSession(deps.db, token, policy)
          .then((session) => {
            if (!session) close();
          })
          .catch(() => {});
      },
    };
    removeClient = deps.hub.add(client);
    request.raw.on('close', () => removeClient());
  });
}
