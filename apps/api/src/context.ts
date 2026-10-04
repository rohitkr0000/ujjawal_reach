import type { Config } from './config';
import type { Db } from './db';
import type { EventBuffer } from './services/analytics';
import type { SchemeStore } from './services/schemes-store';

/** Everything a route needs. Built once in server.ts (or in a test). */
export interface AppContext {
  db: Db;
  config: Config;
  store: SchemeStore;
  events: EventBuffer;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the admin auth check. */
    adminAuth?: { id: string; email: string; role: 'super_admin' | 'editor' };
  }
}
