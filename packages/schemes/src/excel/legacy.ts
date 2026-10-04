import ExcelJS from 'exceljs';
import type { RawRow } from '../types';
import { looksLikeXlsx } from './util';

/**
 * One-time adapter for the first Delhi spreadsheet (Delhi_Yojana_Master_With_Links.xlsx).
 * It turns the old free-text columns into the values of the final template. Anything it cannot
 * map is reported, never guessed, and the scheme is marked "needs review".
 */
export interface LegacyIssue {
  schemeId: string;
  field: string;
  original: string;
  message: string;
}

export interface LegacyResult {
  rows: RawRow[];
  issues: LegacyIssue[];
  fatal: string[];
}

function s(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v !== null && 'text' in (v as object)) return String((v as { text: unknown }).text).trim();
  return String(v).trim();
}

export function mapLevel(original: string): string | null {
  const t = original.toLowerCase();
  const central = t.includes('central');
  const state = t.includes('state') || t.includes('delhi');
  if (central && state) return 'State & Central';
  if (central) return 'Central';
  if (state) return 'State';
  return null;
}

const BENEFICIARY_RULES: Array<[RegExp, string]> = [
  [/student/, 'Student'],
  [/farmer/, 'Farmer'],
  [/senior/, 'Senior Citizen'],
  [/widow|woman|girl|female/, 'Woman'],
  [/child/, 'Child'],
  [/disab|divyang|person with/, 'Person with Disability'],
  [/patient|health/, 'Patient'],
  [/vendor/, 'Vendor'],
  [/entrepreneur|msme|business/, 'Entrepreneur'],
  [/artisan|craft/, 'Artisan'],
  [/worker|laborer|labourer/, 'Worker'],
  [/household|ration|food/, 'Household'],
  [/homeless|slum|urban poor/, 'Homeless / Urban Poor'],
  [/resident|public|visitor/, 'General Public'],
];

export function mapBeneficiaries(original: string): { values: string[]; review: boolean; unknown: string[] } {
  const values: string[] = [];
  const unknown: string[] = [];
  let review = false;
  for (const tokenRaw of original.split(/[,/]/)) {
    const token = tokenRaw.trim().toLowerCase();
    if (!token) continue;
    if (token.includes('scheme-specific')) {
      review = true;
      continue;
    }
    const hit = BENEFICIARY_RULES.find(([re]) => re.test(token));
    if (!hit) unknown.push(tokenRaw.trim());
    else if (!values.includes(hit[1])) values.push(hit[1]);
  }
  return { values, review: review || unknown.length > 0, unknown };
}

export function mapCastes(original: string): { values: string[]; review: boolean; note: string } {
  const values: string[] = [];
  let review = false;
  let note = '';
  for (const tokenRaw of original.split(/[,/]/)) {
    const t = tokenRaw.trim();
    if (!t || /^not specified$/i.test(t)) continue;
    const canon = ['SC', 'ST', 'OBC', 'EWS', 'Minority', 'General'].find((c) => c.toLowerCase() === t.toLowerCase());
    if (canon) {
      if (!values.includes(canon)) values.push(canon);
    } else {
      review = true;
      note += `${note ? '; ' : ''}caste column also says "${t}"`;
    }
  }
  return { values, review, note };
}

export function mapChannel(original: string): string {
  const t = original.toLowerCase();
  if (t === 'department/institution/other') return 'Department / Office';
  if (t.includes('e-district')) return 'e-District';
  if (t.includes('hospital') || t.includes('health centre')) return 'Hospital / Health Centre';
  if (t.includes('helpline')) return 'Helpline';
  if (t.includes('bank')) return 'Bank';
  if (t.includes('school') || t.includes('college') || t.includes('institution')) return 'School / College';
  if (t.includes('portal') || /\.(gov\.)?in\b/.test(t)) return 'Online Portal';
  if (t.includes('department') || t.includes('dept') || t.includes('board')) return 'Department / Office';
  return 'Other';
}

export function mapResidence(original: string): { value: string; review: boolean } {
  const t = original.toLowerCase();
  if (t.includes('scheme-specific')) return { value: 'Any', review: true };
  if (t.includes('delhi-linked')) return { value: 'State resident', review: false };
  if (t.includes('pan-india')) return { value: 'Pan-India', review: false };
  return { value: 'Any', review: false };
}

export async function parseLegacyWorkbook(buf: Uint8Array, state = 'Delhi'): Promise<LegacyResult> {
  const out: LegacyResult = { rows: [], issues: [], fatal: [] };
  if (!looksLikeXlsx(buf)) {
    out.fatal.push('Not an .xlsx file');
    return out;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const ws = wb.getWorksheet('All_Schemes_Database');
  if (!ws) {
    out.fatal.push('Sheet "All_Schemes_Database" not found');
    return out;
  }
  const headers = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => headers.set(s(cell.value), col));
  const need = [
    'Scheme_ID', 'Scheme Name', 'Category / Sector', 'Level (Delhi / Central)', 'Gender_Focus', 'Age_Min',
    'Age_Max', 'Caste_Category', 'Beneficiary_Type', 'Residence_Type', 'Application_Channel', 'Application_URL',
  ];
  const missing = need.filter((h) => !headers.has(h));
  if (missing.length) {
    out.fatal.push(`Missing column(s): ${missing.join(', ')}`);
    return out;
  }

  ws.eachRow((row, n) => {
    if (n === 1) return;
    const get = (h: string) => s(row.getCell(headers.get(h)!).value);
    const id = get('Scheme_ID');
    if (!id) return;
    const issue = (field: string, original: string, message: string) =>
      out.issues.push({ schemeId: id, field, original, message });
    const reasons: string[] = [];

    const levelOrig = get('Level (Delhi / Central)');
    const level = mapLevel(levelOrig);
    if (!level) issue('Level', levelOrig, 'Unknown level');

    const ben = mapBeneficiaries(get('Beneficiary_Type'));
    if (ben.review) {
      reasons.push('beneficiary type is scheme-specific or unknown');
      for (const u of ben.unknown) issue('Beneficiary_Type', u, 'Unknown beneficiary value');
    }
    const caste = mapCastes(get('Caste_Category'));
    if (caste.review) {
      reasons.push(caste.note);
      issue('Caste_Category', get('Caste_Category'), caste.note);
    }
    const res = mapResidence(get('Residence_Type'));
    if (res.review) reasons.push('residence rule is scheme-specific');

    const channelOrig = get('Application_Channel');
    const ageMinRaw = get('Age_Min');
    const ageMaxRaw = get('Age_Max');
    if (!ageMinRaw && !ageMaxRaw) issue('Age', '', 'No age range in the file, so there is no age rule');

    const note =
      `Imported from Delhi_Yojana_Master_With_Links.xlsx. Original channel: ${channelOrig || 'n/a'}.` +
      (reasons.length ? ` Needs review: ${reasons.join('; ')}.` : '');

    out.rows.push({
      Scheme_ID: id,
      State: state,
      'Scheme Name': get('Scheme Name'),
      'Category / Sector': get('Category / Sector'),
      Level: level ?? '',
      Scope: ben.values.includes('Household') || ben.values.includes('Homeless / Urban Poor') ? 'Family' : 'Individual',
      Gender_Focus: /female/i.test(get('Gender_Focus')) ? 'Female' : 'All',
      Age_Min: ageMinRaw,
      Age_Max: ageMaxRaw,
      Caste_Category: caste.values.join(', '),
      Beneficiary_Type: ben.values.join(', '),
      Income_Max: '',
      Education_Levels: '',
      Residence_Type: res.value,
      Application_Channel: mapChannel(channelOrig),
      Application_URL: get('Application_URL'),
      Description: '',
      Description_Hindi: '',
      Status: 'active',
      Last_Verified_Date: '',
      Source_Note: note.slice(0, 500),
      Tags: '',
    });
  });
  return out;
}
