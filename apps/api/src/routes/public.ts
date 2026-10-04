import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { notFound } from '../lib/errors';
import { stateFromSlug } from '../services/schemes-store';

export function publicRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/health', async () => {
    await ctx.db.query('SELECT 1');
    return { ok: true };
  });

  /** The published scheme file of a state. Cached by browsers and by the CDN. */
  app.get<{ Params: { slug: string } }>('/public/schemes/:slug', async (req, reply) => {
    const state = stateFromSlug(req.params.slug);
    if (!state) throw notFound('Unknown state');
    const pub = await ctx.store.getPublished(state);
    reply.header('etag', pub.etag);
    reply.header('cache-control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400');
    if (req.headers['if-none-match'] === pub.etag) return reply.code(304).send();
    return reply.type('application/json; charset=utf-8').send(pub.body);
  });
}
