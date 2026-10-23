import pino from 'pino';
import type { LogLevel } from './config';

export type Logger = pino.Logger;

/** JSON logs to stdout (read by Coolify); human-readable when running in a terminal. */
export function createLogger(level: LogLevel): Logger {
  const pretty = process.stdout.isTTY && process.env.NODE_ENV !== 'production';
  return pino({
    level,
    base: { service: 'dashboard' },
    redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' },
        }
      : undefined,
  });
}
