// Vinted Assistant <-> Gemini bridge — content script on the PWA's own origin
// (https://*.pages.dev/*).
//
// The PWA keeps all its data in the browser's IndexedDB ("vinted-assistant"). The React
// app (src/Studio.tsx) dispatches a "va:gemini-automate" CustomEvent on window when the
// user asks to put a garment on their AI model via Gemini. This content script listens for
// that event, reads the garment and pose photos straight out of IndexedDB, hands them to the
// extension's background worker to forward to a second content script that drives
// gemini.google.com, and — once that script reports a finished image back through
// chrome.storage.local — writes the resulting "ai_model" photo back onto the item.
//
// Why this file duplicates src/db.ts's IndexedDB logic instead of importing it: a content
// script runs in an "isolated world" — it shares the page's DOM and storage (IndexedDB,
// localStorage, cookies) with the real page, but not its JS execution context or ES modules.
// There is no way to `import` src/db.ts from here; this file is loaded as a flat <script>,
// same as the existing extension/content.js. So the handful of IndexedDB operations actually
// needed (get an item, get a model-pose, put an updated item) are reimplemented inline below,
// matching src/db.ts's schema exactly (same DB name/version, store names, key paths).

(function () {
  "use strict";

  const DB_NAME = "vinted-assistant";
  const DB_VERSION = 3;
  const ITEMS = "items";
  const POSES = "model-poses";

  // Opens the existing database without creating it and without touching its schema. This
  // content script never runs before the PWA itself has opened the DB at least once, so the
  // stores already exist; onupgradeneeded here is a no-op safety net, not a schema owner.
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(POSES)) db.createObjectStore(POSES, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function withStore(storeName, mode, fn) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  const getItem = (id) => withStore(ITEMS, "readonly", (s) => s.get(id));
  const getPose = (id) => withStore(POSES, "readonly", (s) => s.get(id));
  const putItem = (item) => withStore(ITEMS, "readwrite", (s) => s.put(item));

  // Blob -> raw base64 (no "data:" prefix), chunked to stay well clear of any call-stack
  // limit on very large arrays. Mirrors src/photos.ts's toBase64().
  async function blobToBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const CHUNK = 0x2000; // 8KB
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  // base64 -> Blob, for the finished image coming back from Gemini.
  function base64ToBlob(base64, type) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  function dispatchStatus(detail) {
    window.dispatchEvent(new CustomEvent("va:gemini-status", { detail }));
  }

  // Clears the shared job key so a bad write never wedges future automations. Failures here
  // are swallowed: there is nothing more useful to do with them, and the caller has already
  // reported its own status.
  async function clearJob() {
    try {
      await chrome.storage.local.remove("geminiJob");
    } catch {
      // best-effort cleanup only
    }
  }

  async function handleAutomate(detail) {
    const { itemId, garmentPhotoId, poseId, prompt } = detail || {};
    // "tryon": garment + model pose -> new AI photo on the item. "enhance": one photo of the
    // item -> Gemini redraws its background, result stored on that photo (Photo.improved).
    const mode = detail && detail.mode === "enhance" ? "enhance" : "tryon";
    let garmentBase64;
    let poseBase64 = "";
    try {
      const [item, pose] = await Promise.all([getItem(itemId), mode === "enhance" ? null : getPose(poseId)]);
      if (!item) throw new Error(`Item ${itemId} not found`);
      const photo = (item.photos || []).find((p) => p.id === garmentPhotoId);
      if (!photo) throw new Error(`Garment photo ${garmentPhotoId} not found on item ${itemId}`);
      if (mode === "tryon" && !pose) throw new Error(`Model pose ${poseId} not found`);
      // Both modes start from the photo as shot (or its auto-fix), never from an earlier Gemini
      // version, so the garment is not redrawn twice.
      garmentBase64 = await blobToBase64(photo.useFixed && photo.fixed ? photo.fixed : photo.blob);
      if (pose) poseBase64 = await blobToBase64(pose.blob);
    } catch (e) {
      dispatchStatus({ status: "failed", error: (e && e.message) || "Could not read the photos." });
      return;
    }

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "GEMINI_JOB_START",
        job: { mode, itemId, garmentPhotoId, poseId, prompt, garmentBase64, poseBase64 },
      });
    } catch (e) {
      dispatchStatus({ status: "failed", error: (e && e.message) || "Could not reach the extension." });
      return;
    }

    if (!response || response.ok !== true) {
      dispatchStatus({ status: "failed", error: (response && response.error) || "Could not start the Gemini job." });
      return;
    }
    dispatchStatus({ status: "started" });
  }

  // Re-reads the item fresh (time has passed since the job started) and appends the new
  // "ai_model" photo, matching the shape the Photos screen (src/Studio.tsx)
  // already build: unapproved (include: false) until the user accepts it.
  async function appendAiModelPhoto(itemId, blob) {
    const item = await getItem(itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);
    const photo = { id: crypto.randomUUID(), kind: "ai_model", blob, addedAt: Date.now(), include: false };
    const updated = { ...item, photos: [...(item.photos || []), photo], updatedAt: Date.now() };
    await putItem(updated);
  }

  // Stores Gemini's redrawn photo in the photo's "improved" slot, which every listing step
  // already reads (listingPhotos, hand-off, on-model). It starts unapproved (useImproved
  // false): Gemini can alter colour or print, so the user ticks it after checking.
  async function saveEnhancedPhoto(itemId, photoId, blob) {
    const item = await getItem(itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);
    if (!(item.photos || []).some((p) => p.id === photoId)) throw new Error(`Photo ${photoId} not found on item ${itemId}`);
    const photos = item.photos.map((p) =>
      p.id === photoId ? { ...p, improved: blob, useImproved: false } : p,
    );
    await putItem({ ...item, photos, updatedAt: Date.now() });
  }

  async function handleJobFinished(job) {
    try {
      if (job.status === "done") {
        const blob = base64ToBlob(job.resultBase64, "image/jpeg");
        if (job.mode === "enhance") await saveEnhancedPhoto(job.itemId, job.garmentPhotoId, blob);
        else await appendAiModelPhoto(job.itemId, blob);
        await clearJob();
        dispatchStatus({ status: "done" });
      } else {
        await clearJob();
        dispatchStatus({ status: "failed", error: job.error });
      }
    } catch (e) {
      await clearJob();
      dispatchStatus({ status: "failed", error: (e && e.message) || "Could not save the result." });
    }
  }

  window.addEventListener("va:gemini-automate", (e) => {
    handleAutomate(e.detail);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.geminiJob) return;
    const job = changes.geminiJob.newValue;
    if (job && (job.status === "done" || job.status === "failed")) {
      handleJobFinished(job);
    }
  });
})();
