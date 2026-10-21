// CSV for French spreadsheets: ";" separator, decimal commas, CRLF lines, and a UTF-8 byte-order mark so
// Excel and Numbers read the accents. Text that a spreadsheet would run as a formula is defused.
import type { PurchaseRow, ReceiptRow } from "./pro";

export type Cell = string | number;

const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: Cell): string {
  if (typeof value === "number") return value.toFixed(2).replace(".", ",");
  // A leading quote makes Excel and Numbers treat the cell as plain text instead of a formula.
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

export const receiptsCsv = (rows: ReceiptRow[]) =>
  toCsv(["Date", "Référence", "Désignation", "Montant (€)", "Mode de règlement"], rows.map((r) => [r.date, r.ref, r.description, r.amount, r.method]));

export const purchasesCsv = (rows: PurchaseRow[]) =>
  toCsv(["Date", "Référence", "Désignation", "Montant (€)", "Date estimée"], rows.map((r) => [r.date, r.ref, r.description, r.amount, r.dateEstimated ? "oui" : "non"]));
