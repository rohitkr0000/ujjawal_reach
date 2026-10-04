import ExcelJS from 'exceljs';
import {
  BENEFICIARIES,
  CASTES,
  CHANNELS,
  EDUCATION_LEVELS,
  GENDER_FOCUS,
  LEVELS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  RESIDENCE_TYPES,
  SCOPES,
  STATES,
  STATUSES,
} from '../constants';
import { HEADERS, REQUIRED_HEADERS, TEMPLATE_COLUMNS, headerKey } from '../columns';
import { schemeToRawRow, safeCell } from '../row';
import type { RawRow, Scheme } from '../types';
import { looksLikeXlsx } from './util';

export { looksLikeXlsx };

export interface ParsedRow {
  /** Row number in the Excel sheet (header is row 1). */
  rowNumber: number;
  raw: RawRow;
}

export interface ParsedWorkbook {
  rows: ParsedRow[];
  /** Problems that stop the whole import (wrong file, missing headers, too many rows). */
  fatal: string[];
  /** Problems that do not stop the import (unknown extra columns). */
  warnings: string[];
}

const SCHEMES_SHEET = 'Schemes';


function cellToValue(v: ExcelJS.CellValue): { value: unknown; formula: boolean } {
  if (v === null || v === undefined) return { value: '', formula: false };
  if (v instanceof Date) return { value: v, formula: false };
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if ('formula' in o || 'sharedFormula' in o) return { value: '', formula: true };
    if (Array.isArray(o.richText))
      return { value: (o.richText as Array<{ text: string }>).map((r) => r.text).join(''), formula: false };
    if (typeof o.text === 'string') return { value: o.text, formula: false };
    if ('error' in o) return { value: '', formula: false };
  }
  return { value: v, formula: false };
}

/** Read the "Schemes" sheet of an uploaded .xlsx file. Does not validate the values. */
export async function parseSchemesWorkbook(buf: Uint8Array): Promise<ParsedWorkbook> {
  const out: ParsedWorkbook = { rows: [], fatal: [], warnings: [] };
  if (buf.length > MAX_IMPORT_BYTES) {
    out.fatal.push('File is larger than 5 MB');
    return out;
  }
  if (!looksLikeXlsx(buf)) {
    out.fatal.push('This is not an .xlsx file');
    return out;
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  } catch {
    out.fatal.push('The file could not be read. Is it a damaged or password protected file?');
    return out;
  }
  const ws = wb.worksheets.find((w) => w.name.trim().toLowerCase() === SCHEMES_SHEET.toLowerCase());
  if (!ws) {
    out.fatal.push(`The sheet "${SCHEMES_SHEET}" was not found. Use the template from the admin panel.`);
    return out;
  }

  const byKey = new Map(HEADERS.map((h) => [headerKey(h), h]));
  const colToHeader = new Map<number, string>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const raw = cellToValue(cell.value).value;
    const h = String(raw ?? '').trim();
    if (!h) return;
    const known = byKey.get(headerKey(h));
    if (known) colToHeader.set(col, known);
    else out.warnings.push(`Column "${h}" is not part of the template and was ignored`);
  });
  const present = new Set(colToHeader.values());
  const missing = REQUIRED_HEADERS.filter((h) => !present.has(h));
  if (missing.length) {
    out.fatal.push(`Missing required column(s): ${missing.join(', ')}`);
    return out;
  }

  const lastRow = ws.actualRowCount;
  if (lastRow - 1 > MAX_IMPORT_ROWS) {
    out.fatal.push(`More than ${MAX_IMPORT_ROWS} rows`);
    return out;
  }

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: RawRow = {};
    let hasData = false;
    colToHeader.forEach((header, col) => {
      const { value, formula } = cellToValue(row.getCell(col).value);
      if (formula) {
        raw[header] = '=formula';
      } else {
        raw[header] = value;
      }
      if (String(value instanceof Date ? 'd' : (value ?? '')).trim() !== '') hasData = true;
    });
    if (hasData) out.rows.push({ rowNumber, raw });
  });
  if (out.rows.length > MAX_IMPORT_ROWS) {
    out.rows = [];
    out.fatal.push(`More than ${MAX_IMPORT_ROWS} rows`);
  }
  return out;
}

const SHEET_HEADER_FILL = (required: boolean): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: required ? 'FFFB923C' : 'FF93C5FD' },
});

const ALLOWED_LISTS: Array<{ header: string; values: readonly string[]; column?: string }> = [
  { header: 'State', values: STATES, column: 'State' },
  { header: 'Level', values: LEVELS, column: 'Level' },
  { header: 'Scope', values: SCOPES, column: 'Scope' },
  { header: 'Gender_Focus', values: GENDER_FOCUS, column: 'Gender_Focus' },
  { header: 'Caste_Category', values: CASTES },
  { header: 'Beneficiary_Type', values: BENEFICIARIES },
  { header: 'Education_Levels', values: EDUCATION_LEVELS },
  { header: 'Residence_Type', values: RESIDENCE_TYPES, column: 'Residence_Type' },
  { header: 'Application_Channel', values: CHANNELS, column: 'Application_Channel' },
  { header: 'Status', values: STATUSES, column: 'Status' },
];

function colLetter(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/**
 * Build the scheme workbook. With no schemes it is the blank template (headers, dropdowns and
 * instructions); with schemes it is an export that can be edited and uploaded again.
 */
export async function buildSchemesWorkbook(schemes: Scheme[] = []): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ujjwal Reach';

  const info = wb.addWorksheet('Instructions');
  info.getColumn(1).width = 120;
  [
    "Ujjwal Reach scheme template. Fill the 'Schemes' sheet, one scheme per row.",
    'Orange headers are required. Blue headers are optional.',
    'Multi-value columns (Caste_Category, Beneficiary_Type, Education_Levels) take comma-separated values from Allowed_Values.',
    "Blank rule columns mean 'no rule' (the scheme does not filter on that field). Write 'needs review' in Source_Note when the rules are unclear: such a scheme stays hidden until an admin confirms it.",
    "Scope: 'Family' schemes are shown once per family (ration, housing, health cover). 'Individual' schemes are shown per person.",
    'Rows missing from an upload are NOT deleted. Set Status to inactive to remove a scheme from the public site.',
    'Every scheme needs an official Application_URL and a Last_Verified_Date.',
    'Max 2,000 rows, 5 MB, .xlsx only. Do not start text cells with = + - @.',
  ].forEach((line, i) => (info.getCell(i + 1, 1).value = line));
  info.getCell(1, 1).font = { bold: true, size: 13 };

  const ws = wb.addWorksheet('Schemes', { views: [{ state: 'frozen', ySplit: 1 }] });
  const allowed = wb.addWorksheet('Allowed_Values');

  ALLOWED_LISTS.forEach((l, i) => {
    allowed.getCell(1, i + 1).value = l.header;
    allowed.getCell(1, i + 1).font = { bold: true };
    allowed.getColumn(i + 1).width = 26;
    l.values.forEach((v, r) => (allowed.getCell(r + 2, i + 1).value = v));
  });

  TEMPLATE_COLUMNS.forEach((c, i) => {
    const cell = ws.getCell(1, i + 1);
    cell.value = c.header;
    cell.font = { bold: true };
    cell.fill = SHEET_HEADER_FILL(c.required);
    cell.note = c.help;
    ws.getColumn(i + 1).width = c.width;
  });

  schemes.forEach((s, r) => {
    const row = schemeToRawRow(s);
    TEMPLATE_COLUMNS.forEach((c, i) => {
      const v = row[c.header];
      if (v !== null && v !== undefined && v !== '') ws.getCell(r + 2, i + 1).value = v;
    });
  });

  const lastRow = MAX_IMPORT_ROWS + 1;
  ALLOWED_LISTS.forEach((l, i) => {
    if (!l.column) return;
    const col = TEMPLATE_COLUMNS.findIndex((c) => c.header === l.column) + 1;
    if (col < 1) return;
    const range = `Allowed_Values!$${colLetter(i + 1)}$2:$${colLetter(i + 1)}$${l.values.length + 1}`;
    for (let r = 2; r <= lastRow; r++) {
      ws.getCell(r, col).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`=${range}`],
        showErrorMessage: true,
        errorTitle: 'Not allowed',
        error: 'Pick a value from the list',
      };
    }
  });

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

export { parseLegacyWorkbook } from './legacy';
export { safeCell };
