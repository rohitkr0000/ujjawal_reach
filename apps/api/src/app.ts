import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { Config } from './config';
import type { AppContext } from './context';
import type { Db } from './db';
import { AppError } from './lib/errors';
import { adminAnalyticsRoutes } from './routes/admin-analytics';
import { adminAuthRoutes } from './routes/admin-auth';
import { adminImportRoutes } from './routes/admin-imports';
import { adminSchemeRoutes } from './routes/admin-schemes';
import { eventRoutes } from './routes/events';
import { publicRoutes } from './routes/public';
import { registrationRoutes } from './routes/registrations';
import { notifyError } from './services/alerts';
import { EventBuffer } from './services/analytics';
import { SchemeStore } from './services/schemes-store';

export interface BuildOptions {
  db: Db;
  config: Config;
  logger?: boolean;
}

export async function buildApp(opts: BuildOptions): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const { db, config } = opts;
  const events = new EventBuffer(db, config.NODE_ENV === 'test' ? 0 : 1000, (m) => console.error(m));
  const ctx: AppContext = { db, config, store: new SchemeStore(db), events };
  events.start();

  const app = Fastify({
    // One log line per request is too much at thousands of requests per second. Slow requests and
    // errors are logged by the onResponse hook below.
    disableRequestLogging: true, // deprecated in Fastify 6: move to logController when upgrading
    logger: opts.logger
      ? {
          level: config.isProd ? 'info' : 'debug',
          // Never write tokens into the logs.
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        }
      : false,
    trustProxy: config.isProd, // behind the host's load balancer: use the real client IP
    bodyLimit: 1_000_000,
  });

  // The browser tracker sends text/plain so the request needs no CORS preflight. Parse it as JSON.
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new AppError(400, 'Body is not valid JSON', 'bad_request'), undefined);
    }
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'if-none-match'],
    exposedHeaders: ['etag', 'content-disposition'],
    maxAge: 86400,
  });
  await app.register(rateLimit, {
    // Generous: many users can sit behind one mobile-network address.
    max: config.NODE_ENV === 'test' || config.DISABLE_IP_LIMITS === 'true' ? 10_000_000 : 1200,
    timeWindow: '1 minute',
    allowList: (req) => req.url === '/health',
  });
  await app.register(jwt, { secret: config.JWT_SECRET });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 } });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ message: err.message, code: err.code, details: err.details });
    }
    if (err.statusCode === 429) {
      return reply.code(429).send({ message: 'Too many requests. Please slow down.', code: 'too_many_requests' });
    }
    if (err.statusCode && err.statusCode < 500) {
      // Fastify's own client errors (bad JSON, body too large, wrong content type...).
      return reply.code(err.statusCode).send({ message: err.message, code: err.code ?? 'bad_request' });
    }
    req.log.error(err);
    void notifyError(config, `${req.method} ${req.routeOptions?.url ?? 'unknown route'} failed`, String(err?.message ?? err));
    return reply.code(500).send({ message: 'Something went wrong on our side', code: 'internal' });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ message: 'Not found', code: 'not_found' }));

  // How long the API itself took (without network or queueing in front of it).
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('server-timing', `app;dur=${reply.elapsedTime.toFixed(1)}`);
    return payload;
  });
  app.addHook('onResponse', async (req, reply) => {
    if (reply.statusCode >= 500 || reply.elapsedTime > 1000) {
      req.log.warn({ method: req.method, url: req.url.split('?')[0], status: reply.statusCode, ms: Math.round(reply.elapsedTime) }, 'request');
    }
  });
  // Write queued tracking events before the server stops.
  app.addHook('onClose', async () => {
    await events.stop();
  });

  publicRoutes(app, ctx);
  registrationRoutes(app, ctx);
  adminAuthRoutes(app, ctx);
  adminSchemeRoutes(app, ctx);
  adminImportRoutes(app, ctx);
  adminAnalyticsRoutes(app, ctx);
  eventRoutes(app, ctx);

  return { app, ctx };
}
