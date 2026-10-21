import { describe, expect, it } from "vitest";
import { crc32, openZip, zipBlobs } from "./zip";

const text = (s: string) => new Blob([s], { type: "text/plain" });

describe("crc32", () => {
  it("matches the standard check value", async () => {
    expect(await crc32(text("123456789"))).toBe(0xcbf43926);
  });

  it("is 0 for an empty blob", async () => {
    expect(await crc32(new Blob([]))).toBe(0);
  });
});

describe("zip round trip", () => {
  it("stores and reads text and binary entries", async () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 254, 253]);
    const zip = await openZip(
      await zipBlobs([
        { name: "manifest.json", data: text('{"a":1}') },
        { name: "photos/x/y/blob.jpg", data: new Blob([bytes], { type: "image/jpeg" }) },
      ]),
    );
    expect(zip.names).toEqual(["manifest.json", "photos/x/y/blob.jpg"]);
    expect(await zip.text("manifest.json")).toBe('{"a":1}');
    const photo = await zip.blob("photos/x/y/blob.jpg", "image/jpeg");
    expect(photo.type).toBe("image/jpeg");
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(bytes);
  });

  it("handles an empty entry and a UTF-8 name", async () => {
    const zip = await openZip(await zipBlobs([{ name: "vide.txt", data: new Blob([]) }, { name: "é/ü.txt", data: text("ok") }]));
    expect(await zip.text("vide.txt")).toBe("");
    expect(await zip.text("é/ü.txt")).toBe("ok");
  });

  it("handles an archive with no entries", async () => {
    const zip = await openZip(await zipBlobs([]));
    expect(zip.names).toEqual([]);
  });

  it("handles many entries", async () => {
    const entries = Array.from({ length: 1000 }, (_, i) => ({ name: `f/${i}.txt`, data: text(`n${i}`) }));
    const zip = await openZip(await zipBlobs(entries));
    expect(zip.names).toHaveLength(1000);
    expect(await zip.text("f/999.txt")).toBe("n999");
  });

  it("reports a missing entry", async () => {
    const zip = await openZip(await zipBlobs([{ name: "a", data: text("a") }]));
    expect(zip.has("b")).toBe(false);
    await expect(zip.text("b")).rejects.toThrow(/missing/);
  });
});

describe("zip errors", () => {
  it("rejects a file that is not a zip", async () => {
    await expect(openZip(text("hello, not a zip at all, definitely"))).rejects.toThrow(/not a valid backup/);
  });

  it("rejects a truncated archive", async () => {
    const whole = await zipBlobs([{ name: "a.txt", data: text("some content here") }]);
    await expect(openZip(whole.slice(0, whole.size - 10))).rejects.toThrow();
  });

  it("detects damaged content through the checksum", async () => {
    const whole = new Uint8Array(await (await zipBlobs([{ name: "manifest.json", data: text("hello world") }])).arrayBuffer());
    const at = whole.findIndex((_, i) => String.fromCharCode(...whole.slice(i, i + 5)) === "hello");
    whole[at] ^= 0xff;
    const zip = await openZip(new Blob([whole]));
    await expect(zip.text("manifest.json")).rejects.toThrow(/damaged/);
  });
});
