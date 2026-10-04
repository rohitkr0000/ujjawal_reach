import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { schemeFingerprint, validateRow, type Scheme } from '../src';
import {
  buildSchemesWorkbook,
  parseLegacyWorkbook,
  parseSchemesWorkbook,
  safeCell,
} from '../src/excel';

const dataDir = resolve(__dirname, '../../../data');
const legacyFile = () => readFileSync(resolve(dataDir, 'Delhi_Yojana_Master_With_Links.xlsx'));
const toBuf = async (wb: ExcelJS.Workbook) => Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);

async function workbookWith(rows: unknown[][], headers?: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Schemes');
  ws.addRow(headers ?? ['Scheme_ID', 'State', 'Scheme Name', 'Level', 'Application_URL']);
  rows.forEach((r) => ws.addRow(r));
  return toBuf(wb);
}

describe('template and export', () => {
  it('builds a blank template with all headers and dropdowns', async () => {
    const buf = await buildSchemesWorkbook([]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Instructions', 'Schemes', 'Allowed_Values']);
    const ws = wb.getWorksheet('Schemes')!;
    expect(ws.getRow(1).getCell(1).value).toBe('Scheme_ID');
    expect(ws.getCell('B2').dataValidation?.type).toBe('list');
    const parsed = await parseSchemesWorkbook(buf);
    expect(parsed.fatal).toEqual([]);
    expect(parsed.rows).toEqual([]);
  });

  it('exports schemes and imports them back unchanged', async () => {
    const src: Scheme[] = [
      validateRow({
        Scheme_ID: 'T-001',
        State: 'Delhi',
        'Scheme Name': 'A scheme',
        'Category / Sector': 'Health & Medical',
        Level: 'State & Central',
        Scope: 'Family',
        Gender_Focus: 'Female',
        Age_Min: 18,
        Age_Max: 60,
        Caste_Category: 'SC, OBC',
        Beneficiary_Type: 'Woman, Patient',
        Income_Max: 250000,
        Education_Levels: 'Graduate',
        Residence_Type: 'State resident',
        Application_Channel: 'e-District',
        Application_URL: 'https://example.gov.in/apply',
        Description: 'English text',
        Description_Hindi: 'हिंदी पाठ',
        Status: 'inactive',
        Last_Verified_Date: '2026-10-01',
        Source_Note: 'checked',
        Tags: '#featured',
      }).scheme!,
    ];
    const parsed = await parseSchemesWorkbook(await buildSchemesWorkbook(src));
    expect(parsed.fatal).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    const back = validateRow(parsed.rows[0]!.raw);
    expect(back.errors).toEqual([]);
    expect(schemeFingerprint(back.scheme!)).toBe(schemeFingerprint(src[0]!));
  });

  it('strips leading formula characters when exporting', () => {
    expect(safeCell('=SUM(A1)')).toBe('SUM(A1)');
    expect(safeCell('+1')).toBe('1');
    expect(safeCell('@x')).toBe('x');
    expect(safeCell('normal')).toBe('normal');
  });
});

describe('parseSchemesWorkbook', () => {
  it('rejects non-xlsx files', async () => {
    const r = await parseSchemesWorkbook(Buffer.from('id,name\n1,2'));
    expect(r.fatal[0]).toMatch(/not an .xlsx/i);
  });
  it('rejects a damaged zip', async () => {
    const r = await parseSchemesWorkbook(
      Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('garbage')]),
    );
    expect(r.fatal.length).toBe(1);
  });
  it('rejects files over 5 MB', async () => {
    const r = await parseSchemesWorkbook(Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(r.fatal[0]).toMatch(/5 MB/);
  });
  it('needs the Schemes sheet', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Other').addRow(['x']);
    const r = await parseSchemesWorkbook(await toBuf(wb));
    expect(r.fatal[0]).toMatch(/Schemes/);
  });
  it('needs the required headers', async () => {
    const r = await parseSchemesWorkbook(await workbookWith([['a']], ['Scheme_ID']));
    expect(r.fatal[0]).toMatch(/Missing required column/);
  });
  it('matches headers loosely and warns about extra columns', async () => {
    const buf = await workbookWith(
      [['X-1', 'Delhi', 'Name', 'State', 'https://a.in/', 'extra']],
      ['scheme id', 'STATE', 'scheme name', 'level', 'Application URL', 'My Notes'],
    );
    const r = await parseSchemesWorkbook(buf);
    expect(r.fatal).toEqual([]);
    expect(r.warnings[0]).toMatch(/My Notes/);
    expect(r.rows[0]!.raw['Scheme_ID']).toBe('X-1');
  });
  it('flags formula cells and skips blank rows, keeping real row numbers', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Schemes');
    ws.addRow(['Scheme_ID', 'State', 'Scheme Name', 'Level', 'Application_URL']);
    ws.addRow([]);
    ws.addRow(['X-1', 'Delhi', { formula: '1+1', result: 2 }, 'State', 'https://a.in/']);
    const r = await parseSchemesWorkbook(await toBuf(wb));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.rowNumber).toBe(3);
    expect(validateRow(r.rows[0]!.raw).errors.map((e) => e.field)).toContain('Scheme Name');
  });
  it('reads hyperlink cells as text', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Schemes');
    ws.addRow(['Scheme_ID', 'State', 'Scheme Name', 'Level', 'Application_URL']);
    ws.addRow([
      'X-1',
      'Delhi',
      'N',
      'State',
      { text: 'https://a.in/', hyperlink: 'https://a.in/' },
    ]);
    const r = await parseSchemesWorkbook(await toBuf(wb));
    expect(validateRow(r.rows[0]!.raw).errors).toEqual([]);
  });
  it('rejects more than 2000 rows', async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => [
      `X-${i}`,
      'Delhi',
      'N',
      'State',
      'https://a.in/',
    ]);
    const r = await parseSchemesWorkbook(await workbookWith(rows));
    expect(r.fatal[0]).toMatch(/2000/);
    expect(r.rows).toEqual([]);
  });
});

describe('legacy Delhi file', () => {
  it('converts all 83 schemes with no errors and no unknown values', async () => {
    const res = await parseLegacyWorkbook(legacyFile());
    expect(res.fatal).toEqual([]);
    expect(res.rows).toHaveLength(83);
    expect(res.issues.filter((i) => /unknown/i.test(i.message))).toEqual([]);
    const results = res.rows.map(validateRow);
    expect(results.flatMap((r) => r.errors)).toEqual([]);
    const schemes = results.map((r) => r.scheme!);
    expect(new Set(schemes.map((s) => s.id)).size).toBe(83);
    expect(schemes.every((s) => s.state === 'Delhi')).toBe(true);
  });

  it('maps the known variants', async () => {
    const res = await parseLegacyWorkbook(legacyFile());
    const byId = new Map(res.rows.map((r) => [String(r['Scheme_ID']), validateRow(r).scheme!]));
    const ladli = byId.get('DEL-001')!;
    expect(ladli).toMatchObject({
      level: 'State',
      genderFocus: 'Female',
      ageMax: 18,
      channel: 'e-District',
    });
    expect(ladli.conditions).toContainEqual({ field: 'gender', op: '==', value: 'Female' });
    // 120 as the upper age means "no limit"
    expect(byId.get('DEL-002')!.ageMax).toBeNull();
    expect(byId.get('DEL-002')!.ageMin).toBe(18);
    const levels = new Set([...byId.values()].map((s) => s.level));
    expect([...levels].sort()).toEqual(['Central', 'State', 'State & Central']);
  });

  it('marks scheme-specific and unclear rows as needs review', async () => {
    const res = await parseLegacyWorkbook(legacyFile());
    const review = res.rows
      .map(validateRow)
      .map((r) => r.scheme!)
      .filter((s) => s.reviewStatus === 'needs_review');
    expect(review.length).toBeGreaterThan(0);
    expect(review.map((s) => s.id)).toEqual(expect.arrayContaining(['DEL-012', 'DEL-065', 'DEL-073']));
  });
});
