import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, isValidSiret, parseProfile, siretWarning } from "./businessProfile";

describe("parseProfile", () => {
  it("returns the defaults when nothing is stored or it is unreadable", () => {
    expect(parseProfile(null)).toEqual(EMPTY_PROFILE);
    expect(parseProfile("{broken")).toEqual(EMPTY_PROFILE);
    expect(parseProfile("[1,2]")).toEqual(EMPTY_PROFILE);
    expect(parseProfile("null")).toEqual(EMPTY_PROFILE);
  });

  it("keeps valid fields and defaults the rest", () => {
    const p = parseProfile(JSON.stringify({ sellsAsBusiness: true, legalName: "Marie D.", siret: "12345678200010", activity: "company", vatRegime: "subject" }));
    expect(p).toMatchObject({ sellsAsBusiness: true, legalName: "Marie D.", siret: "12345678200010", activity: "company", vatRegime: "subject", address: "" });
  });

  it("ignores values of the wrong type or outside the allowed lists", () => {
    const p = parseProfile(JSON.stringify({ sellsAsBusiness: "yes", legalName: 5, activity: "pirate", vatRegime: 1 }));
    expect(p).toEqual(EMPTY_PROFILE);
  });
});

describe("SIRET check", () => {
  it("accepts numbers that pass the check digit, with or without spaces", () => {
    expect(isValidSiret("12345678200010")).toBe(true);
    expect(isValidSiret("732 829 320 00074")).toBe(true);
  });

  it("rejects a wrong check digit, a wrong length and letters", () => {
    expect(isValidSiret("12345678200011")).toBe(false);
    expect(isValidSiret("1234567820001")).toBe(false);
    expect(isValidSiret("1234567820001A")).toBe(false);
  });

  it("applies the La Poste rule: digits adding up to a multiple of 5", () => {
    const failsLuhn = "35600000000010"; // digit sum 15
    expect(isValidSiret(failsLuhn)).toBe(true);
    expect(isValidSiret("35600000000011")).toBe(false); // digit sum 16
  });

  it("warns without blocking, and says nothing for an empty field", () => {
    expect(siretWarning("")).toBeUndefined();
    expect(siretWarning("123")).toMatch(/14 digits/);
    expect(siretWarning("12345678200011")).toMatch(/check digit/);
    expect(siretWarning("12345678200010")).toBeUndefined();
  });
});
