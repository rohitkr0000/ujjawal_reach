import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { notifyError, resetAlertThrottle } from '../src/services/alerts';
import { bearer, createTestEnv, type TestEnv } from './helpers';

let server: Server;
let url = '';
const received: Array<{ text: string }> = [];
let env: TestEnv;

beforeAll(async () => {
  server = createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      received.push(JSON.parse(b));
      res.end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  env = await createTestEnv({ ERROR_WEBHOOK_URL: url });
});
afterAll(async () => {
  server.close();
  await env.close();
});
beforeEach(() => {
  received.length = 0;
  resetAlertThrottle();
});

describe('error alerts', () => {
  it('sends a message to the webhook', async () => {
    expect(await notifyError({ ERROR_WEBHOOK_URL: url, NODE_ENV: 'production' }, 'Boom', 'details here')).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]!.text).toContain('[Ujjwal Reach production] Boom');
    expect(received[0]!.text).toContain('details here');
  });

  it('sends the same message at most once a minute', async () => {
    const cfg = { ERROR_WEBHOOK_URL: url, NODE_ENV: 'production' as const };
    await notifyError(cfg, 'Same', 'x');
    expect(await notifyError(cfg, 'Same', 'x')).toBe(false);
    expect(await notifyError(cfg, 'Other', 'x')).toBe(true);
    expect(received).toHaveLength(2);
  });

  it('does nothing without a webhook and never throws when the webhook is down', async () => {
    expect(await notifyError({ ERROR_WEBHOOK_URL: '', NODE_ENV: 'production' }, 'a', 'b')).toBe(false);
    expect(await notifyError({ ERROR_WEBHOOK_URL: 'http://127.0.0.1:1/hook', NODE_ENV: 'production' }, 'a', 'b')).toBe(false);
  });

  it('an unexpected server error raises an alert but the caller sees only a generic message', async () => {
    // Break the database on purpose so a normal request fails with a 500.
    const orig = env.ctx.db.query;
    env.ctx.db.query = async () => {
      throw new Error('connection to db lost: password=hunter2');
    };
    const r = await env.app.inject({ method: 'GET', url: '/public/schemes/delhi', headers: bearer('x') });
    env.ctx.db.query = orig;
    expect(r.statusCode).toBe(500);
    expect(r.body).not.toContain('hunter2');
    await new Promise((res) => setTimeout(res, 300));
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0]!.text).toContain('/public/schemes/:slug failed');
  });
});
