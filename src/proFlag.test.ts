import { describe, expect, it } from "vitest";
import { parseProFlag } from "./proFlag";

describe("parseProFlag", () => {
  it("is on only when the profile says the user sells as a business", () => {
    expect(parseProFlag('{"sellsAsBusiness":true,"siret":"1"}')).toBe(true);
    expect(parseProFlag('{"sellsAsBusiness":false}')).toBe(false);
    expect(parseProFlag('{"sellsAsBusiness":"yes"}')).toBe(false);
  });

  it("is off when there is no profile or it is unreadable", () => {
    expect(parseProFlag(null)).toBe(false);
    expect(parseProFlag("")).toBe(false);
    expect(parseProFlag("{not json")).toBe(false);
    expect(parseProFlag("null")).toBe(false);
  });
});
