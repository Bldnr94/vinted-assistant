import { describe, expect, it } from "vitest";
import { purchasesCsv, receiptsCsv, toCsv } from "./csv";

const BOM = "﻿";

describe("toCsv", () => {
  it("starts with a byte-order mark and uses semicolons, CRLF and decimal commas", () => {
    expect(toCsv(["A", "B"], [["x", 12.5], ["y", 3]])).toBe(`${BOM}A;B\r\nx;12,50\r\ny;3,00\r\n`);
  });

  it("quotes cells with semicolons, quotes or line breaks, doubling inner quotes", () => {
    const csv = toCsv(["T"], [["a;b"], ['dit "oui"'], ["ligne1\nligne2"]]);
    expect(csv).toBe(`${BOM}T\r\n"a;b"\r\n"dit ""oui"""\r\n"ligne1\nligne2"\r\n`);
  });

  it("keeps accents and plain text as they are", () => {
    expect(toCsv(["Désignation"], [["Robe été"]])).toBe(`${BOM}Désignation\r\nRobe été\r\n`);
  });

  it("defuses text a spreadsheet would run as a formula", () => {
    const csv = toCsv(["T"], [["=HYPERLINK(\"http://x\")"], ["+1"], ["-2"], ["@SUM(A1)"]]);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(lines.slice(2, 4)).toEqual(["'+1", "'-2"]);
    expect(lines[4]).toBe("'@SUM(A1)");
  });

  it("writes negative numbers as numbers, not text", () => {
    expect(toCsv(["N"], [[-3.5]])).toBe(`${BOM}N\r\n-3,50\r\n`);
  });

  it("writes only the header for no rows", () => {
    expect(toCsv(["A"], [])).toBe(`${BOM}A\r\n`);
  });
});

describe("registers", () => {
  it("writes the receipts register with French headers", () => {
    const csv = receiptsCsv([{ date: "2026-08-04", ref: "AAAAAAAA", description: "Robe", amount: 20, method: "Vinted" }]);
    expect(csv).toBe(`${BOM}Date;Référence;Désignation;Montant (€);Mode de règlement\r\n2026-08-04;AAAAAAAA;Robe;20,00;Vinted\r\n`);
  });

  it("flags estimated purchase dates", () => {
    const csv = purchasesCsv([
      { date: "2026-01-10", ref: "EEEEEEEE", description: "Pull", amount: 3, dateEstimated: false },
      { date: "2026-03-01", ref: "FFFFFFFF", description: "Jean", amount: 6.5, dateEstimated: true },
    ]);
    expect(csv.split("\r\n").slice(1, 3)).toEqual(["2026-01-10;EEEEEEEE;Pull;3,00;non", "2026-03-01;FFFFFFFF;Jean;6,50;oui"]);
  });
});
