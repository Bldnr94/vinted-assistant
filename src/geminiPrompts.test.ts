import { describe, expect, it } from "vitest";
import { lookFor, oneLine, poseFacing, seedFromId, tryOnPrompt } from "./geminiPrompts";

describe("tryOnPrompt", () => {
  it("names image 1 as the person and image 2 as the garment, in the extension's attach order", () => {
    const p = tryOnPrompt("");
    expect(p).toContain("- Image 1: the person");
    expect(p).toContain("- Image 2: the clothing item");
  });

  it("adds the seller's styling only when given", () => {
    expect(tryOnPrompt("")).not.toContain("Styling asked");
    expect(tryOnPrompt("jacket open")).toContain("Styling asked by the seller, which overrides your own choice: jacket open.");
  });

  it("keeps the garment's real condition", () => {
    expect(tryOnPrompt("")).toContain("any visible stain, hole, pilling, fading or wear stays visible");
  });

  it("has a single-line form for the extension", () => {
    const flat = oneLine(tryOnPrompt("jacket open"));
    expect(flat).not.toContain("\n");
    expect(flat).toContain("INPUTS - Image 1: the person");
  });
});

describe("listing looks", () => {
  it("gives the same look for the same listing and model photo, and varies across them", () => {
    expect(lookFor(42, 0)).toEqual(lookFor(42, 0));
    const looks = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(lookFor(seedFromId(`item-${i}`)))));
    expect(looks.size).toBeGreaterThan(10);
  });

  it("swaps 'keep identical' for a new shot when a look is given", () => {
    const look = lookFor(7);
    const p = tryOnPrompt("", look);
    expect(p).toContain(`- pose: ${look.pose}, without turning the body;`);
    expect(p).not.toContain("KEEP EVERYTHING ELSE IDENTICAL");
    expect(tryOnPrompt("")).toContain("KEEP EVERYTHING ELSE IDENTICAL");
  });
});

describe("front and back model photos", () => {
  it("shares light, spot and shoes across a listing's model photos, so the pair matches", () => {
    const [a, b] = [lookFor(123, 0), lookFor(123, 1)];
    expect({ light: b.light, spot: b.spot, shoes: b.shoes }).toEqual({ light: a.light, spot: a.spot, shoes: a.shoes });
  });

  it("never picks a pose that turns the body", () => {
    for (let s = 0; s < 200; s++) expect(lookFor(s, s % 3).pose).not.toMatch(/turn|three-quarter|side view/i);
  });

  it("keeps a back photo facing away, and asks for the item's back when only the front was shot", () => {
    const back = tryOnPrompt("", lookFor(5, 1), "back", "front");
    expect(back).toContain("with their back to the camera");
    expect(back).toContain("never turn them around");
    expect(back).toContain("show the item's back");
    expect(tryOnPrompt("", lookFor(5, 1), "back", "back")).not.toContain("show the item's back");
  });

  it("guesses the second model photo is the back one until you say otherwise", () => {
    expect([0, 1, 2].map((i) => poseFacing({}, i))).toEqual(["front", "back", "front"]);
    expect(poseFacing({ facing: "front" }, 1)).toBe("front");
  });
});
