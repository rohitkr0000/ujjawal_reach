import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { parse } from '../lib/validate';
import { limit } from '../plugins/auth';
import { eventsBodySchema, ingestEvents } from '../services/analytics';

export function eventRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * Browser tracking. Without `consent: true` nothing is stored. Always answers 204 so a failing
   * tracker never shows an error to the visitor.
   */
  app.post('/events', limit(ctx, 1200), async (req, reply) => {
    const body = req.body as { consent?: unknown } | null;
    if (!body || typeof body !== 'object' || body.consent !== true) return reply.code(204).send();
    const data = parse(eventsBodySchema, body);
    await ingestEvents(ctx, data);
    return reply.code(204).send();
  });
}
