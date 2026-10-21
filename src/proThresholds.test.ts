import { describe, expect, it } from "vitest";
import { PRO_THRESHOLDS, thresholdsAreStale } from "./proThresholds";

describe("PRO_THRESHOLDS", () => {
  it("has a check date and every figure has an official https source", () => {
    expect(PRO_THRESHOLDS.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const spec of PRO_THRESHOLDS.specs) {
      expect(spec.sourceUrl, spec.key).toMatch(/^https:\/\/(www\.|entreprendre\.)?(impots|service-public|vinted)\./);
    }
  });

  it("has unique keys and no unverified (null) limit left silently in", () => {
    const keys = PRO_THRESHOLDS.specs.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const spec of PRO_THRESHOLDS.specs) expect(spec.limit, spec.key).not.toBeNull();
  });

  it("follows Vinted's wording: 30 sales counts once reached, 2000 euros has to be exceeded", () => {
    const get = (key: string) => PRO_THRESHOLDS.specs.find((s) => s.key === key)!;
    expect(get("dac7-sales")).toMatchObject({ limit: 30, unit: "count", inclusive: true });
    expect(get("dac7-amount")).toMatchObject({ limit: 2000, unit: "eur" });
    expect(get("dac7-amount").inclusive).toBeFalsy();
  });

  it("lists every source it points to", () => {
    const urls = PRO_THRESHOLDS.sources.map((s) => s.url);
    for (const spec of PRO_THRESHOLDS.specs) expect(urls).toContain(spec.sourceUrl);
  });
});

describe("thresholdsAreStale", () => {
  it("is fresh within a year and stale after", () => {
    expect(thresholdsAreStale(Date.UTC(2027, 5, 1), "2026-10-21")).toBe(false);
    expect(thresholdsAreStale(Date.UTC(2027, 10, 1), "2026-10-21")).toBe(true);
  });
});
