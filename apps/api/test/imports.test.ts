import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { schemeToRawRow, validateRow } from '@ujjwal/schemes';
import { buildSchemesWorkbook } from '@ujjwal/schemes/excel';
import { adminToken, bearer, createTestEnv, multipart, type TestEnv } from './helpers';

let env: TestEnv;
let boss: string;
let editor: string;

beforeAll(async () => {
  env = await createTestEnv();
  boss = await adminToken(env, 'boss@example.com', 'super_admin');
  editor = await adminToken(env, 'editor@example.com', 'editor');
});
afterAll(() => env.close());

beforeEach(async () => {
  await env.db.query('DELETE FROM scheme_import_rows');
  await env.db.query('DELETE FROM scheme_imports');
  await env.db.query('DELETE FROM scheme_versions');
  await env.db.query('DELETE FROM schemes');
  await env.db.query('DELETE FROM published_schemes');
  env.ctx.store.invalidate();
});

const dataFile = (name: string) => readFileSync(resolve(__dirname, '../../../data', name));

const base = (id: string, over: Record<string, unknown> = {}) => ({
  Scheme_ID: id,
  State: 'Delhi',
  'Scheme Name': `Scheme ${id}`,
  Level: 'State',
  Application_URL: 'https://example.gov.in/apply',
  Description: 'A test scheme',
  Last_Verified_Date: '2026-10-01',
  ...over,
});

async function xlsx(rows: Array<Record<string, unknown>>): Promise<Buffer> {
  const schemes = rows.map((r) => {
    const v = validateRow(r as any);
    if (!v.scheme) throw new Error(JSON.stringify(v.errors));
    return v.scheme;
  });
  return buildSchemesWorkbook(schemes);
}

/** A workbook written straight from raw rows, so invalid rows can be tested. */
async function rawXlsx(rows: Array<Record<string, unknown>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Schemes');
  const headers = ['Scheme_ID', 'State', 'Scheme Name', 'Level', 'Application_URL', 'Age_Min', 'Age_Max', 'Caste_Category', 'Status', 'Tags', 'Source_Note', 'Description', 'Last_Verified_Date'];
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(headers.map((h) => r[h] ?? null)));
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

async function upload(token: string, data: Buffer, opts: { filename?: string; state?: string } = {}) {
  const m = multipart({ filename: opts.filename ?? 'schemes.xlsx', data }, opts.state ? { state: opts.state } : {});
  return env.app.inject({ method: 'POST', url: '/admin/imports', headers: { ...m.headers, ...bearer(token) }, payload: m.payload });
}

const confirm = (token: string, id: string, onError?: 'cancel' | 'skip') =>
  env.app.inject({ method: 'POST', url: `/admin/imports/${id}/confirm`, headers: bearer(token), payload: onError ? { onError } : {} });

const publicFile = async (slug = 'delhi') => (await env.app.inject({ method: 'GET', url: `/public/schemes/${slug}` })).json();

describe('uploading the real Delhi spreadsheet', () => {
  it('previews 83 new schemes, saves nothing until confirmed, then publishes them', async () => {
    const r = await upload(editor, dataFile('Delhi_Schemes.xlsx'), { state: 'Delhi' });
    expect(r.statusCode).toBe(201);
    const { summary, rows } = r.json();
    expect(summary).toMatchObject({ total: 83, new: 83, updated: 0, unchanged: 0, errors: 0, status: 'preview' });
    expect(rows).toHaveLength(83);
    expect(rows[0]).toMatchObject({ rowNumber: 2, schemeId: 'DEL-001', action: 'new' });
    expect((await env.db.query('SELECT count(*)::int AS n FROM schemes')).rows[0]!.n).toBe(0);
    expect((await publicFile()).schemes).toHaveLength(0);

    const c = await confirm(editor, summary.id);
    expect(c.statusCode).toBe(200);
    expect(c.json()).toMatchObject({ status: 'applied', new: 83, updated: 0, published: ['Delhi'] });
    expect((await env.db.query('SELECT count(*)::int AS n FROM schemes')).rows[0]!.n).toBe(83);

    const pub = await publicFile();
    // 11 rows are "needs review" and stay hidden until an admin confirms them
    expect(pub.schemes).toHaveLength(72);
    expect(pub.schemes.find((s: any) => s.id === 'DEL-001')).toMatchObject({ name: 'Delhi Ladli Scheme', tags: expect.arrayContaining(['delhi', 'womenchild']) });
    expect(pub.schemes.find((s: any) => s.id === 'DEL-012')).toBeUndefined();
  });

  it('uploads the Madhya Pradesh prototype file too and keeps the states apart', async () => {
    const a = await upload(editor, dataFile('Delhi_Schemes.xlsx'), { state: 'Delhi' });
    await confirm(editor, a.json().summary.id);
    const b = await upload(editor, dataFile('MadhyaPradesh_Schemes.xlsx'), { state: 'Madhya Pradesh' });
    expect(b.json().summary).toMatchObject({ total: 15, errors: 0 });
    await confirm(editor, b.json().summary.id);
    expect((await publicFile('madhyapradesh')).schemes).toHaveLength(14);
    expect((await publicFile('delhi')).schemes).toHaveLength(72);
  });

  it('refuses the Delhi file when the upload is for another state', async () => {
    const r = await upload(editor, dataFile('Delhi_Schemes.xlsx'), { state: 'Madhya Pradesh' });
    expect(r.statusCode).toBe(201);
    expect(r.json().summary).toMatchObject({ errors: 83, new: 0 });
    expect(r.json().rows[0].errors[0].message).toMatch(/for Delhi but this upload is for Madhya Pradesh/);
    expect((await confirm(editor, r.json().summary.id)).statusCode).toBe(409);
  });
});

describe('rejecting bad uploads', () => {
  it('needs a login and the editor role', async () => {
    const m = multipart({ filename: 'a.xlsx', data: Buffer.from('x') });
    expect((await env.app.inject({ method: 'POST', url: '/admin/imports', headers: m.headers, payload: m.payload })).statusCode).toBe(401);
    expect((await upload('not-a-real-token', Buffer.from('x'))).statusCode).toBe(401);
  });

  it.each([
    ['a csv', 'schemes.csv', Buffer.from('a,b\n1,2')],
    ['a macro workbook', 'schemes.xlsm', Buffer.from('PK\u0003\u0004')],
    ['an old .xls', 'schemes.xls', Buffer.from('x')],
  ])('rejects %s by name', async (_l, filename, data) => {
    const r = await upload(editor, data, { filename });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toMatch(/\.xlsx/);
  });

  it('rejects an .xlsx name with other content', async () => {
    const r = await upload(editor, Buffer.from('this is plain text'));
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toMatch(/not an .xlsx/i);
  });

  it('rejects files over 5 MB', async () => {
    const r = await upload(editor, Buffer.alloc(5 * 1024 * 1024 + 10, 1));
    expect([400, 413]).toContain(r.statusCode);
  });

  it('rejects a request with no file, and a non-multipart request', async () => {
    const m = multipart(null, { state: 'Delhi' });
    expect((await env.app.inject({ method: 'POST', url: '/admin/imports', headers: { ...m.headers, ...bearer(editor) }, payload: m.payload })).statusCode).toBe(400);
    expect((await env.app.inject({ method: 'POST', url: '/admin/imports', headers: bearer(editor), payload: { a: 1 } })).statusCode).toBe(400);
  });

  it('rejects an unknown state value', async () => {
    expect((await upload(editor, await xlsx([base('X-1')]), { state: 'Goa' })).statusCode).toBe(400);
  });

  it('rejects a sheet with no rows or the wrong sheet', async () => {
    expect((await upload(editor, await buildSchemesWorkbook([]))).statusCode).toBe(400);
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Other').addRow(['x']);
    const r = await upload(editor, Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer));
    expect(r.json().message).toMatch(/"Schemes" was not found/);
  });
});

describe('row validation in the preview', () => {
  const rows = [
    base('OK-1'),
    base('OK-2'),
    base('OK-1', { 'Scheme Name': 'Same id again' }),
    base('BAD-LINK', { Application_URL: 'javascript:alert(1)' }),
    base('BAD-CASTE', { Caste_Category: 'Martian' }),
    base('BAD-AGE', { Age_Min: 50, Age_Max: 20 }),
    base('BAD-TAG', { Tags: '#ok #not_ok' }),
    base('FORMULA', { 'Scheme Name': '=HYPERLINK("http://evil")' }),
    base('', {}),
  ];

  it('marks each bad row with the reason and counts them', async () => {
    const r = await upload(editor, await rawXlsx(rows));
    expect(r.statusCode).toBe(201);
    const { summary, rows: out } = r.json();
    expect(summary).toMatchObject({ total: 9, new: 2, errors: 7 });
    const by = Object.fromEntries(out.map((x: any) => [`${x.rowNumber}`, x]));
    expect(by['2'].action).toBe('new');
    expect(by['4'].errors[0].message).toMatch(/Duplicate of row 2/);
    expect(by['5'].errors[0].field).toBe('Application_URL');
    expect(by['6'].errors[0].field).toBe('Caste_Category');
    expect(by['7'].errors[0].field).toBe('Age_Min');
    expect(by['8'].errors[0].field).toBe('Tags');
    expect(by['9'].errors[0].field).toBe('Scheme Name');
    expect(by['10'].errors.some((e: any) => e.field === 'Scheme_ID')).toBe(true);
  });

  it('default confirm cancels when rows have errors; "skip" saves only the valid rows', async () => {
    const r = await upload(editor, await rawXlsx(rows));
    const id = r.json().summary.id;
    const refused = await confirm(editor, id);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().message).toMatch(/7 row\(s\) have errors/);
    expect((await env.db.query('SELECT count(*)::int AS n FROM schemes')).rows[0]!.n).toBe(0);

    const ok = await confirm(editor, id, 'skip');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ new: 2, errors: 7 });
    expect((await env.db.query('SELECT id FROM schemes ORDER BY id')).rows).toEqual([{ id: 'OK-1' }, { id: 'OK-2' }]);
  });

  it('downloads the errors as a CSV that is safe to open in Excel', async () => {
    const r = await upload(editor, await rawXlsx(rows));
    const csv = await env.app.inject({ method: 'GET', url: `/admin/imports/${r.json().summary.id}/errors`, headers: bearer(editor) });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('Excel row,Scheme_ID,Column,Problem');
    expect(csv.body).toContain('Duplicate of row 2');
  });
});

describe('updating with a second upload', () => {
  it('shows unchanged and updated rows with the changed fields', async () => {
    const first = await upload(editor, await xlsx([base('U-1'), base('U-2')]));
    await confirm(editor, first.json().summary.id);

    const again = await upload(editor, await xlsx([base('U-1'), base('U-2', { 'Scheme Name': 'Renamed', Age_Min: 60 }), base('U-3')]));
    expect(again.json().summary).toMatchObject({ new: 1, updated: 1, unchanged: 1, errors: 0 });
    const by = Object.fromEntries(again.json().rows.map((r: any) => [r.schemeId, r]));
    expect(by['U-1'].action).toBe('unchanged');
    expect(by['U-2'].action).toBe('updated');
    expect(by['U-2'].changedFields.sort()).toEqual(['ageMin', 'name', 'tags']); // Age_Min 60 also changes the automatic age tag
    expect(by['U-3'].action).toBe('new');

    await confirm(editor, again.json().summary.id);
    expect((await env.db.query(`SELECT name, age_min FROM schemes WHERE id = 'U-2'`)).rows[0]).toEqual({ name: 'Renamed', age_min: 60 });
    // schemes missing from an upload are NOT deleted
    const third = await upload(editor, await xlsx([base('U-3')]));
    await confirm(editor, third.json().summary.id);
    expect((await env.db.query('SELECT count(*)::int AS n FROM schemes')).rows[0]!.n).toBe(3);
  });

  it('setting Status to inactive hides a scheme from the public file', async () => {
    const a = await upload(editor, await xlsx([base('S-1'), base('S-2')]));
    await confirm(editor, a.json().summary.id);
    expect((await publicFile()).schemes).toHaveLength(2);
    const b = await upload(editor, await xlsx([base('S-1', { Status: 'inactive' })]));
    await confirm(editor, b.json().summary.id);
    expect((await publicFile()).schemes.map((s: any) => s.id)).toEqual(['S-2']);
  });

  it('cannot apply the same import twice, even in parallel', async () => {
    const a = await upload(editor, await xlsx([base('P-1'), base('P-2')]));
    const id = a.json().summary.id;
    const [r1, r2] = await Promise.all([confirm(editor, id), confirm(editor, id)]);
    expect([r1.statusCode, r2.statusCode].sort()).toEqual([200, 409]);
    expect((await env.db.query('SELECT count(*)::int AS n FROM scheme_versions WHERE import_id = $1', [id])).rows[0]!.n).toBe(2);
    expect((await confirm(editor, id)).statusCode).toBe(409);
  });

  it('can be cancelled', async () => {
    const a = await upload(editor, await xlsx([base('C-1')]));
    const id = a.json().summary.id;
    expect((await env.app.inject({ method: 'POST', url: `/admin/imports/${id}/cancel`, headers: bearer(editor) })).statusCode).toBe(200);
    expect((await confirm(editor, id)).statusCode).toBe(409);
    expect((await env.db.query('SELECT count(*)::int AS n FROM schemes')).rows[0]!.n).toBe(0);
  });

  it('saves all rows or none: a failure half way leaves the schemes untouched', async () => {
    const a = await upload(editor, await xlsx([base('A-1'), base('A-2'), base('A-3')]));
    const id = a.json().summary.id;
    // break the stored data of the last row so the database refuses it
    await env.db.query(`UPDATE scheme_import_rows SET data = jsonb_set(data, '{name}', 'null') WHERE import_id = $1 AND scheme_id = 'A-3'`, [id]);
    const c = await confirm(editor, id);
    expect(c.statusCode).toBe(500);
    expect((await env.db.query('SELECT count(*)::int AS n FROM schemes')).rows[0]!.n).toBe(0);
    expect((await env.db.query('SELECT status FROM scheme_imports WHERE id = $1', [id])).rows[0]).toEqual({ status: 'preview' });
    expect((await publicFile()).schemes).toHaveLength(0);
  });
});

describe('rollback', () => {
  it('removes new schemes and restores updated ones, and republishes', async () => {
    const first = await upload(editor, await xlsx([base('R-1', { 'Scheme Name': 'Original' })]));
    await confirm(editor, first.json().summary.id);

    const second = await upload(editor, await xlsx([base('R-1', { 'Scheme Name': 'Changed' }), base('R-2')]));
    const id = second.json().summary.id;
    await confirm(editor, id);
    expect((await publicFile()).schemes.map((s: any) => s.name).sort()).toEqual(['Changed', 'Scheme R-2']);

    const rb = await env.app.inject({ method: 'POST', url: `/admin/imports/${id}/rollback`, headers: bearer(editor) });
    expect(rb.statusCode).toBe(200);
    expect(rb.json()).toMatchObject({ restored: 1, removed: 1 });
    expect((await publicFile()).schemes.map((s: any) => s.name)).toEqual(['Original']);
    expect((await env.db.query('SELECT status FROM scheme_imports WHERE id = $1', [id])).rows[0]).toEqual({ status: 'rolled_back' });

    // rolled back only once
    expect((await env.app.inject({ method: 'POST', url: `/admin/imports/${id}/rollback`, headers: bearer(editor) })).statusCode).toBe(409);
  });

  it('is refused when a newer import changed the same scheme', async () => {
    const a = await upload(editor, await xlsx([base('N-1', { 'Scheme Name': 'One' })]));
    await confirm(editor, a.json().summary.id);
    const b = await upload(editor, await xlsx([base('N-1', { 'Scheme Name': 'Two' })]));
    await confirm(editor, b.json().summary.id);
    const rb = await env.app.inject({ method: 'POST', url: `/admin/imports/${a.json().summary.id}/rollback`, headers: bearer(editor) });
    expect(rb.statusCode).toBe(409);
    expect(rb.json().message).toMatch(/Newer changes exist for N-1/);
    expect((await env.db.query(`SELECT name FROM schemes WHERE id = 'N-1'`)).rows[0]).toEqual({ name: 'Two' });
    // the newer one can be rolled back, then the older one
    expect((await env.app.inject({ method: 'POST', url: `/admin/imports/${b.json().summary.id}/rollback`, headers: bearer(editor) })).statusCode).toBe(200);
    expect((await env.app.inject({ method: 'POST', url: `/admin/imports/${a.json().summary.id}/rollback`, headers: bearer(editor) })).statusCode).toBe(200);
    expect((await env.db.query('SELECT count(*)::int AS n FROM schemes')).rows[0]!.n).toBe(0);
  });

  it('cannot roll back a preview', async () => {
    const a = await upload(editor, await xlsx([base('V-1')]));
    expect((await env.app.inject({ method: 'POST', url: `/admin/imports/${a.json().summary.id}/rollback`, headers: bearer(editor) })).statusCode).toBe(409);
  });
});

describe('history, template, export', () => {
  it('lists imports with who did them and returns row details', async () => {
    const a = await upload(editor, await xlsx([base('H-1')]));
    await confirm(editor, a.json().summary.id);
    const list = await env.app.inject({ method: 'GET', url: '/admin/imports', headers: bearer(editor) });
    expect(list.json().items[0]).toMatchObject({ filename: 'schemes.xlsx', status: 'applied', new: 1, admin: 'editor@example.com' });
    const detail = await env.app.inject({ method: 'GET', url: `/admin/imports/${a.json().summary.id}?action=new`, headers: bearer(editor) });
    expect(detail.json().rows).toHaveLength(1);
    expect(detail.json().rows[0].name).toBe('Scheme H-1');
  });

  it('serves the template and an export that can be uploaded again unchanged', async () => {
    const t = await env.app.inject({ method: 'GET', url: '/admin/template', headers: bearer(editor) });
    expect(t.statusCode).toBe(200);
    expect(t.headers['content-disposition']).toContain('Scheme_Template.xlsx');
    expect(t.rawPayload.subarray(0, 2).toString()).toBe('PK');

    const a = await upload(editor, await xlsx([base('E-1', { Tags: '#featured', Age_Min: 18 }), base('E-2')]));
    await confirm(editor, a.json().summary.id);
    const ex = await env.app.inject({ method: 'GET', url: '/admin/schemes/export?state=Delhi', headers: bearer(editor) });
    expect(ex.statusCode).toBe(200);
    const re = await upload(editor, ex.rawPayload);
    expect(re.json().summary).toMatchObject({ total: 2, unchanged: 2, new: 0, updated: 0, errors: 0 });
  });

  it('only the super admin can download the original file', async () => {
    const a = await upload(editor, await xlsx([base('F-1')]));
    const url = `/admin/imports/${a.json().summary.id}/file`;
    expect((await env.app.inject({ method: 'GET', url, headers: bearer(editor) })).statusCode).toBe(403);
    expect((await env.app.inject({ method: 'GET', url, headers: bearer(boss) })).statusCode).toBe(200);
  });
});

describe('managing single schemes', () => {
  beforeEach(async () => {
    const a = await upload(editor, await xlsx([base('M-1', { Age_Min: 18, Tags: '#featured' }), base('M-2', { Source_Note: 'Needs review: unclear' })]));
    await confirm(editor, a.json().summary.id);
  });

  it('lists with filters and paging', async () => {
    const get = (q: string) => env.app.inject({ method: 'GET', url: `/admin/schemes${q}`, headers: bearer(editor) }).then((r) => r.json());
    expect((await get('')).total).toBe(2);
    expect((await get('?review=needs_review')).items.map((i: any) => i.id)).toEqual(['M-2']);
    expect((await get('?tag=%23featured')).items.map((i: any) => i.id)).toEqual(['M-1']);
    expect((await get('?q=m-2')).items).toHaveLength(1);
    expect((await get('?q=scheme%20m')).total).toBe(2);
    expect((await get("?q=%25")).total).toBe(0);
    expect((await get('?state=Madhya%20Pradesh')).total).toBe(0);
    expect((await get('?pageSize=1&page=2')).items).toHaveLength(1);
    expect((await env.app.inject({ method: 'GET', url: '/admin/schemes?pageSize=9999', headers: bearer(editor) })).statusCode).toBe(400);
  });

  it('edits one scheme, validates, records the version and republishes', async () => {
    const bad = await env.app.inject({ method: 'PATCH', url: '/admin/schemes/M-1', headers: bearer(editor), payload: { row: { Application_URL: 'nope' } } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().details.errors[0].field).toBe('Application_URL');

    const ok = await env.app.inject({ method: 'PATCH', url: '/admin/schemes/M-1', headers: bearer(editor), payload: { row: { 'Scheme Name': 'Edited name', Age_Max: 40, Scheme_ID: 'HACK' } } });
    expect(ok.statusCode).toBe(200);
    const detail = await env.app.inject({ method: 'GET', url: '/admin/schemes/M-1', headers: bearer(editor) });
    expect(detail.json().scheme).toMatchObject({ id: 'M-1', name: 'Edited name', ageMin: 18, ageMax: 40 });
    expect(detail.json().versions[0].action).toBe('update');
    expect((await publicFile()).schemes.find((s: any) => s.id === 'M-1').name).toBe('Edited name');
    expect((await env.app.inject({ method: 'PATCH', url: '/admin/schemes/NOPE', headers: bearer(editor), payload: { row: {} } })).statusCode).toBe(404);
  });

  it('a reviewed scheme becomes public only after an admin confirms it', async () => {
    expect((await publicFile()).schemes.map((s: any) => s.id)).toEqual(['M-1']);
    const r = await env.app.inject({ method: 'POST', url: '/admin/schemes/M-2/confirm-review', headers: bearer(editor) });
    expect(r.statusCode).toBe(200);
    expect(r.json().scheme.reviewStatus).toBe('ok');
    expect(r.json().scheme.sourceNote).toMatch(/Reviewed by editor@example.com on \d{4}-\d\d-\d\d/);
    expect((await publicFile()).schemes.map((s: any) => s.id)).toEqual(['M-1', 'M-2']);
    expect((await env.app.inject({ method: 'POST', url: '/admin/schemes/M-2/confirm-review', headers: bearer(editor) })).statusCode).toBe(409);
  });

  it('creates a scheme by hand and refuses duplicates', async () => {
    const row = { ...schemeToRawRow(validateRow(base('M-9')).scheme!) };
    const r = await env.app.inject({ method: 'POST', url: '/admin/schemes', headers: bearer(editor), payload: { row } });
    expect(r.statusCode).toBe(201);
    expect((await env.app.inject({ method: 'POST', url: '/admin/schemes', headers: bearer(editor), payload: { row } })).statusCode).toBe(409);
    expect((await publicFile()).schemes.map((s: any) => s.id)).toContain('M-9');
  });

  it('only a super admin can delete', async () => {
    expect((await env.app.inject({ method: 'DELETE', url: '/admin/schemes/M-1', headers: bearer(editor) })).statusCode).toBe(403);
    expect((await env.app.inject({ method: 'DELETE', url: '/admin/schemes/M-1', headers: bearer(boss) })).statusCode).toBe(204);
    expect((await publicFile()).schemes.map((s: any) => s.id)).toEqual([]);
    expect((await env.app.inject({ method: 'DELETE', url: '/admin/schemes/M-1', headers: bearer(boss) })).statusCode).toBe(404);
  });

  it('lists tags with how many schemes use them', async () => {
    const r = await env.app.inject({ method: 'GET', url: '/admin/tags', headers: bearer(editor) });
    const tags = Object.fromEntries(r.json().items.map((t: any) => [t.tag, t]));
    expect(tags['delhi'].schemes).toBe(2);
    expect(tags['featured']).toMatchObject({ kind: 'admin', schemes: 1 });
  });
});
