// Copies the on-phone cutout model (IS-Net, from @imgly/background-removal-data) and the
// ONNX runtime it needs into dist/cutout/, in the chunked layout @imgly/background-removal
// reads. Chunks stay under Cloudflare Pages' 25 MiB file limit and are named by content
// hash, so they can be cached forever.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const out = "dist/cutout";
const data = "node_modules/@imgly/background-removal-data/dist";
const ort = "node_modules/onnxruntime-web/dist";
const CHUNK = 4 * 1024 * 1024;

mkdirSync(out, { recursive: true });
const resources = {};

// The model is already chunked in the data package ("medium" is the fp16 IS-Net, ~88 MB).
const dataResources = JSON.parse(readFileSync(`${data}/resources.json`, "utf8"));
const model = dataResources["/models/medium"];
for (const chunk of model.chunks) copyFileSync(`${data}/${chunk.hash}`, `${out}/${chunk.hash}`);
resources["/models/isnet_fp16"] = {
  chunks: model.chunks.map((c) => ({ name: c.hash, offsets: c.offsets })),
  size: model.size,
  mime: "application/octet-stream",
};

// The runtime must match the onnxruntime-web version the app bundles, so it comes from there.
const runtime = [
  ["ort-wasm-simd-threaded.wasm", "application/wasm"],
  ["ort-wasm-simd-threaded.mjs", "text/javascript"],
  ["ort-wasm-simd-threaded.jsep.wasm", "application/wasm"],
  ["ort-wasm-simd-threaded.jsep.mjs", "text/javascript"],
];
for (const [file, mime] of runtime) {
  const bytes = readFileSync(`${ort}/${file}`);
  const chunks = [];
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const part = bytes.subarray(start, Math.min(start + CHUNK, bytes.length));
    const name = createHash("sha256").update(part).digest("hex");
    writeFileSync(`${out}/${name}`, part);
    chunks.push({ name, offsets: [start, start + part.length] });
  }
  resources[`/onnxruntime-web/${file}`] = { chunks, size: bytes.length, mime };
}

// Vite also emits onnxruntime's own copy of the .wasm, which nothing loads: the library
// points the runtime at the chunks above instead.
for (const file of readdirSync("dist/assets")) {
  if (/^ort-wasm.*\.wasm$/.test(file)) rmSync(`dist/assets/${file}`);
}

writeFileSync(`${out}/resources.json`, JSON.stringify(resources));
console.log(`cutout assets: ${Object.keys(resources).length} files in ${out}`);
