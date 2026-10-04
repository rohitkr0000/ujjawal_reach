const BOM = String.fromCharCode(0xfeff);

/** A CSV cell that cannot be run as a formula when opened in Excel or Sheets. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  // The BOM makes Excel read Hindi text correctly.
  return `${BOM}${[headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
