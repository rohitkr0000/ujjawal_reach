import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkLink, checkLinks } from '../src/services/links';

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = req.url ?? '/';
    if (u === '/ok') return void res.end('hello');
    if (u === '/missing') return void res.writeHead(404).end('no');
    if (u === '/error') return void res.writeHead(500).end('boom');
    if (u === '/forbidden') return void res.writeHead(403).end('bots not allowed');
    if (u === '/slash') return void res.writeHead(301, { location: '/slash/' }).end();
    if (u === '/slash/') return void res.end('same page');
    if (u === '/moved') return void res.writeHead(302, { location: '/new-home' }).end();
    if (u === '/new-home') return void res.end('new');
    if (u === '/slow') return; // never answers
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const check = (path: string, timeoutMs = 2000) => checkLink({ id: 'T-1', url: base + path }, { timeoutMs });

describe('link checker', () => {
  it('ok', async () => expect(await check('/ok')).toMatchObject({ status: 'ok', httpStatus: 200 }));
  it('missing page is broken', async () => expect(await check('/missing')).toMatchObject({ status: 'broken', httpStatus: 404, note: 'Page not found' }));
  it('server error is broken', async () => expect(await check('/error')).toMatchObject({ status: 'broken', httpStatus: 500 }));
  it('403 is "blocked", to be checked by hand', async () => expect(await check('/forbidden')).toMatchObject({ status: 'blocked', httpStatus: 403 }));
  it('a redirect to the same page (trailing slash) is fine', async () => expect((await check('/slash')).status).toBe('ok'));
  it('a redirect to another page means the link moved', async () => {
    const r = await check('/moved');
    expect(r.status).toBe('moved');
    expect(r.finalUrl).toBe(`${base}/new-home`);
  });
  it('no answer in time is broken', async () => expect(await check('/slow', 300)).toMatchObject({ status: 'broken', httpStatus: null, note: 'No answer in time' }));
  it('an unreachable host is broken', async () => {
    const r = await checkLink({ id: 'T-2', url: 'http://127.0.0.1:1/x' }, { timeoutMs: 2000 });
    expect(r.status).toBe('broken');
    expect(r.note).toMatch(/Could not connect/);
  });
  it('checks many links at once and keeps the order', async () => {
    const items = ['/ok', '/missing', '/ok', '/forbidden', '/moved'].map((p, i) => ({ id: `X-${i}`, url: base + p }));
    let progress = 0;
    const r = await checkLinks(items, { concurrency: 2, timeoutMs: 2000, onProgress: () => progress++ });
    expect(r.map((x) => x.status)).toEqual(['ok', 'broken', 'ok', 'blocked', 'moved']);
    expect(r.map((x) => x.id)).toEqual(items.map((i) => i.id));
    expect(progress).toBe(5);
  });
  it('an empty list is fine', async () => expect(await checkLinks([])).toEqual([]));
});
