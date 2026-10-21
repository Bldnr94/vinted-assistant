import { describe, expect, it } from "vitest";
import { dateFr, dateLong, euros, fromDateInput, monthKey, round2, toDateInput, yearOf } from "./format";

// Intl uses non-breaking spaces; compare with plain ones.
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("euros", () => {
  it("shows whole euros without decimals and cents when needed", () => {
    expect(plain(euros(12))).toBe("12 €");
    expect(plain(euros(4.79))).toBe("4,79 €");
    expect(plain(euros(0))).toBe("0 €");
  });

  it("rounds float noise to cents", () => {
    expect(plain(euros(4.79 - 0.1))).toBe("4,69 €");
  });

  it("shows ? when there is no amount", () => {
    expect(euros(undefined)).toBe("?");
  });
});

describe("round2", () => {
  it("rounds to cents", () => {
    expect(round2(4.79 - 0.1)).toBe(4.69);
    expect(round2(10)).toBe(10);
  });
});

describe("date inputs", () => {
  it("round-trips a calendar day in both summer and winter time", () => {
    for (const day of ["2026-01-15", "2026-07-01", "2026-03-29", "2026-10-25"]) {
      expect(toDateInput(fromDateInput(day))).toBe(day);
    }
  });

  it("gives nothing for an empty or malformed value", () => {
    expect(fromDateInput("")).toBeUndefined();
    expect(fromDateInput("15/01/2026")).toBeUndefined();
    expect(toDateInput(undefined)).toBe("");
  });
});

describe("Paris calendar", () => {
  it("puts a late-evening UTC time in the next Paris month (summer time)", () => {
    expect(monthKey(Date.UTC(2026, 2, 31, 22, 30))).toBe("2026-04");
  });

  it("puts new year's eve late evening UTC in the next year (winter time)", () => {
    expect(monthKey(Date.UTC(2026, 11, 31, 23, 30))).toBe("2027-01");
    expect(yearOf(Date.UTC(2026, 11, 31, 23, 30))).toBe(2027);
  });

  it("keeps a midday time in its own month", () => {
    expect(monthKey(Date.UTC(2026, 5, 15, 12, 0))).toBe("2026-06");
  });

  it("formats dates in French", () => {
    expect(dateFr(Date.UTC(2026, 9, 21, 12))).toBe("21 oct.");
    expect(dateLong(Date.UTC(2026, 9, 21, 12))).toBe("21 octobre 2026");
  });
});
