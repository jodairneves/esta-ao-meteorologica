// CSV in the format Excel expects in Brazil: ";" separator, comma as decimal mark, UTF-8 with
// BOM (so accents open correctly) and CRLF line breaks.

const BOM = String.fromCharCode(0xfeff);

export type CsvValue = string | number | null;

function cell(value: CsvValue, decimals: number): string {
  if (value === null) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toFixed(decimals).replace('.', ',') : '';
  }
  return /[";\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(header: string[], rows: CsvValue[][], decimals = 2): string {
  const lines = [header, ...rows].map((row) => row.map((value) => cell(value, decimals)).join(';'));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
