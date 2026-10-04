/** The columns of the Excel template, in order. Header text must match exactly (case-insensitive). */
export interface TemplateColumn {
  header: string;
  required: boolean;
  width: number;
  help: string;
}

export const TEMPLATE_COLUMNS: TemplateColumn[] = [
  { header: 'Scheme_ID', required: true, width: 12, help: 'Unique ID, for example DEL-001' },
  { header: 'State', required: true, width: 16, help: 'Pick from the list' },
  { header: 'Scheme Name', required: true, width: 46, help: 'Official scheme name' },
  { header: 'Category / Sector', required: false, width: 30, help: 'Free text, for example Education & Scholarships' },
  { header: 'Level', required: true, width: 16, help: 'State, Central or State & Central' },
  { header: 'Scope', required: false, width: 12, help: 'Individual (default) or Family' },
  { header: 'Gender_Focus', required: false, width: 14, help: 'All (default), Female or Male' },
  { header: 'Age_Min', required: false, width: 9, help: 'Whole number, blank = no minimum' },
  { header: 'Age_Max', required: false, width: 9, help: 'Whole number, blank or 120 = no maximum' },
  { header: 'Caste_Category', required: false, width: 22, help: 'Comma separated, blank = any' },
  { header: 'Beneficiary_Type', required: false, width: 28, help: 'Comma separated, blank = any' },
  { header: 'Income_Max', required: false, width: 12, help: 'Annual family income limit in rupees, blank = no limit' },
  { header: 'Education_Levels', required: false, width: 24, help: 'Comma separated, blank = any' },
  { header: 'Residence_Type', required: false, width: 16, help: 'State resident, Pan-India or Any (default)' },
  { header: 'Application_Channel', required: false, width: 22, help: 'Pick from the list' },
  { header: 'Application_URL', required: true, width: 46, help: 'Official https link' },
  { header: 'Description', required: false, width: 50, help: 'One or two sentences in English' },
  { header: 'Description_Hindi', required: false, width: 50, help: 'Same text in Hindi' },
  { header: 'Status', required: false, width: 10, help: 'active (default) or inactive' },
  { header: 'Last_Verified_Date', required: false, width: 16, help: 'YYYY-MM-DD' },
  { header: 'Source_Note', required: false, width: 40, help: "Where the data came from. Write 'needs review' if the rules are unclear" },
  { header: 'Tags', required: false, width: 28, help: 'Extra tags, for example #featured #newscheme' },
];

export const HEADERS = TEMPLATE_COLUMNS.map((c) => c.header);
export const REQUIRED_HEADERS = TEMPLATE_COLUMNS.filter((c) => c.required).map((c) => c.header);

/** Normalise a header for matching: lower case, spaces and punctuation removed. */
export function headerKey(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}
