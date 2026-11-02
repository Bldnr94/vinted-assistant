import { describe, expect, it } from "vitest";
import { oneLine, tryOnPrompt } from "./geminiPrompts";

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
