import * as XLSX from "xlsx";

export interface ExportTable {
  label: string;
  headers: string[];
  rows: Array<Array<string | number | boolean | undefined>>;
}

function quoteCell(value: string | number | boolean | undefined): string {
  if (value == null) return "";
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export function buildCsvFromTables(tables: ExportTable[]): string {
  const lines: string[] = [];
  tables.forEach((table, index) => {
    if (index > 0) lines.push("");
    lines.push(`"${table.label.replace(/"/g, '""')}"`);
    lines.push(table.headers.map(quoteCell).join(","));
    table.rows.forEach((row) => {
      lines.push(row.map(quoteCell).join(","));
    });
  });
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  const maxLength = 31;
  let candidate = name.slice(0, maxLength).replace(/[\[\]\*\/\\\?\:]/g, "");
  if (!candidate) candidate = "Sheet";
  let suffix = 1;
  while (used.has(candidate)) {
    const base = candidate.slice(0, maxLength - String(suffix).length - 1);
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function downloadExcel(filename: string, tables: ExportTable[]) {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  tables.forEach((table) => {
    const aoa = [table.headers, ...table.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const sheetName = sanitizeSheetName(table.label, usedNames);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });
  XLSX.writeFile(wb, filename);
}
