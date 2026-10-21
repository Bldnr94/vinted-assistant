// Minimal ZIP "store" writer and reader for the backup file. No compression: photos are already
// JPEG, and storing them as-is lets the writer pass each photo Blob straight into the output
// Blob without copying it through JS memory (a few hundred photos would otherwise crash a phone tab).

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

// Streams the blob in chunks, so only one chunk is in memory at a time.
export async function crc32(blob: Blob): Promise<number> {
  const reader = blob.stream().getReader();
  let crc = 0xffffffff;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (let i = 0; i < value.length; i++) crc = CRC_TABLE[(crc ^ value[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Blob;
}

const MAX_ENTRIES = 0xfffe;
const MAX_BYTES = 0xfffffffe; // no ZIP64: a backup beyond ~4 GB is refused rather than written wrongly

function dosNow(d = new Date()) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function header(size: number): { bytes: Uint8Array<ArrayBuffer>; view: DataView } {
  const buffer = new ArrayBuffer(size);
  return { bytes: new Uint8Array(buffer), view: new DataView(buffer) };
}

export async function zipBlobs(entries: ZipEntry[]): Promise<Blob> {
  if (entries.length > MAX_ENTRIES) throw new Error("Too many files for one backup archive.");
  const { time, date } = dosNow();
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const size = entry.data.size;
    const crc = await crc32(entry.data);

    const local = header(30 + name.length);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true); // version needed
    local.view.setUint16(6, 0x0800, true); // UTF-8 names
    local.view.setUint16(8, 0, true); // method: store
    local.view.setUint16(10, time, true);
    local.view.setUint16(12, date, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, size, true);
    local.view.setUint32(22, size, true);
    local.view.setUint16(26, name.length, true);
    local.view.setUint16(28, 0, true);
    local.bytes.set(name, 30);

    const dir = header(46 + name.length);
    dir.view.setUint32(0, 0x02014b50, true);
    dir.view.setUint16(4, 20, true); // version made by
    dir.view.setUint16(6, 20, true);
    dir.view.setUint16(8, 0x0800, true);
    dir.view.setUint16(10, 0, true);
    dir.view.setUint16(12, time, true);
    dir.view.setUint16(14, date, true);
    dir.view.setUint32(16, crc, true);
    dir.view.setUint32(20, size, true);
    dir.view.setUint32(24, size, true);
    dir.view.setUint16(28, name.length, true);
    dir.view.setUint32(42, offset, true);
    dir.bytes.set(name, 46);

    parts.push(local.bytes, entry.data);
    central.push(dir.bytes);
    offset += local.bytes.length + size;
    if (offset > MAX_BYTES) throw new Error("The backup is too large for one archive (4 GB limit).");
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, entries.length, true);
  end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, offset, true);
  parts.push(...central, end.bytes);
  return new Blob(parts, { type: "application/zip" });
}

interface CentralEntry {
  crc: number;
  size: number;
  method: number;
  localOffset: number;
}

export interface ZipReader {
  names: string[];
  has(name: string): boolean;
  // A slice of the original file: nothing is read into memory.
  blob(name: string, type?: string): Promise<Blob>;
  // Reads the whole entry and checks its CRC; meant for small entries such as the manifest.
  text(name: string): Promise<string>;
}

const NOT_A_BACKUP = "This file is not a valid backup archive.";

export async function openZip(file: Blob): Promise<ZipReader> {
  const tailStart = Math.max(0, file.size - (22 + 0xffff));
  const tail = new DataView(await file.slice(tailStart, file.size).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(NOT_A_BACKUP);
  const count = tail.getUint16(eocd + 10, true);
  const centralSize = tail.getUint32(eocd + 12, true);
  const centralOffset = tail.getUint32(eocd + 16, true);
  if (count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("This archive needs ZIP64, which backups do not use.");
  }
  if (centralOffset + centralSize > file.size) throw new Error(NOT_A_BACKUP);

  const dir = new DataView(await file.slice(centralOffset, centralOffset + centralSize).arrayBuffer());
  const entries = new Map<string, CentralEntry>();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > dir.byteLength || dir.getUint32(p, true) !== 0x02014b50) throw new Error(NOT_A_BACKUP);
    const nameLen = dir.getUint16(p + 28, true);
    const extraLen = dir.getUint16(p + 30, true);
    const commentLen = dir.getUint16(p + 32, true);
    const name = decoder.decode(new Uint8Array(dir.buffer, p + 46, nameLen));
    entries.set(name, {
      method: dir.getUint16(p + 10, true),
      crc: dir.getUint32(p + 16, true),
      size: dir.getUint32(p + 24, true),
      localOffset: dir.getUint32(p + 42, true),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const entry = (name: string) => {
    const e = entries.get(name);
    if (!e) throw new Error(`The backup is missing "${name}".`);
    if (e.method !== 0) throw new Error("This archive is compressed; only backups made by this app can be read.");
    return e;
  };

  const blob = async (name: string, type = ""): Promise<Blob> => {
    const e = entry(name);
    const local = new DataView(await file.slice(e.localOffset, e.localOffset + 30).arrayBuffer());
    if (local.byteLength < 30 || local.getUint32(0, true) !== 0x04034b50) throw new Error(NOT_A_BACKUP);
    const start = e.localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    if (start + e.size > file.size) throw new Error("The backup file is cut short.");
    return file.slice(start, start + e.size, type);
  };

  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name),
    blob,
    async text(name) {
      const data = await blob(name);
      if ((await crc32(data)) !== entry(name).crc) throw new Error(`"${name}" is damaged (checksum mismatch).`);
      return decoder.decode(await data.arrayBuffer());
    },
  };
}
