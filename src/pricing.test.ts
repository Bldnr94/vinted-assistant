import { describe, expect, it } from "vitest";
import { defaultFloor, suggestedDrop } from "./pricing";

describe("defaultFloor", () => {
  it("uses the low end of the drafted range when it is below the price", () => {
    expect(defaultFloor(20, 14.4)).toBe(14);
  });

  it("falls back to 70% of the price without a usable range", () => {
    expect(defaultFloor(20)).toBe(14);
    expect(defaultFloor(20, 0)).toBe(14);
    expect(defaultFloor(20, 25)).toBe(14);
  });

  it("never goes below 1 euro", () => {
    expect(defaultFloor(1)).toBe(1);
  });
});

describe("suggestedDrop", () => {
  it("cuts by the percentage in whole euros", () => {
    expect(suggestedDrop(25, 10, 12)).toBe(22);
  });

  it("is at least 1 euro lower", () => {
    expect(suggestedDrop(5, 1, 5)).toBe(4);
  });

  it("never goes below the floor", () => {
    expect(suggestedDrop(25, 24, 12)).toBe(24);
  });

  it("returns undefined when already at the floor", () => {
    expect(suggestedDrop(10, 10, 12)).toBeUndefined();
  });
});
