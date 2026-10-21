// Annonces → Vinted — Gemini automation content script
//
// Drives the Gemini web app (https://gemini.google.com/*) to reproduce, step by step, the
// manual flow in src/ModelPhotos.tsx: attach the model photo and the garment photo, switch on
// Gemini's "Create image" tool, send the prompt, wait for the generated image, and hand it
// back. Gemini's API costs money, but the free Google AI plan covers the web UI the user is
// already logged into.
//
// Shares the "relay contract" with extension/bridge-content.js (running on the *.pages.dev
// app tab) via chrome.storage.local key "geminiJob" and the chrome.runtime messages handled
// in background.js (GEMINI_JOB_POLL in, GEMINI_JOB_RESULT out). This file only ever touches
// Gemini's composer: the "+" (Upload and tools) menu, the message box, the send button, and
// the "Download full-sized image" button on the image it generated. It never clicks anything
// that deletes, shares, exports, or signs out, and never navigates away.
//
// Selectors below were checked against the live Gemini page (Oct 2026). Gemini is an Angular
// app whose markup changes without notice; when a step cannot find its element the run stops
// with a clear error, and the manual "Send to Gemini" / "Import result" steps in the app still
// work.

(function () {
  "use strict";

  if (!/^https:\/\/gemini\.google\.com\//.test(location.href)) return;

  const SELECTORS = {
    // "+" button in the composer. Gemini creates its <input type="file"> elements only once
    // this menu has been opened, which is why they cannot be found on a fresh page.
    toolsButton: ['button[aria-label="Upload and tools"]', 'button[aria-label*="Upload" i]'],
    imageInput: ['input[type="file"][accept="image/*"]', 'input[type="file"][accept^="image"]', 'input[type="file"]'],
    menuItem: "gem-list-item",
    menuItemSelectedMark: ".gem-list-item-icon-selected",
    // The composer is a Quill editor inside <rich-textarea>.
    textBox: [
      'rich-textarea div.ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'rich-textarea div[contenteditable="true"]',
      "textarea",
    ],
    sendButton: ['button[aria-label="Send message"]', 'button[aria-label*="Send" i]', 'button[aria-label*="Envoyer" i]'],
    attachment: "uploader-file-preview",
    // Generated images live in the model's answer; the user's own attachments do not.
    resultImage: ["model-response generated-image img", "model-response single-image img", 'model-response img[alt*="AI generated" i]'],
    modelResponse: "model-response",
  };

  const CREATE_IMAGE = /create image|cr[ée]er une image/i;
  const DOWNLOAD_FULL = /download|t[ée]l[ée]charger/i;
  const MAX_SIDE = 1600; // same cap as resizeToJpeg() in src/photos.ts

  // Text that must never be clicked: Gemini's own vocabulary for destructive or navigational
  // actions, English and French.
  const FORBIDDEN_TEXT =
    /delete|remove|clear conversation|clear chat|share|export|settings|sign out|log out|supprimer|effacer|partager|exporter|param(e|è)tres|d(e|é)connexion/i;

  // ---------- small helpers ----------

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pause = (min = 350, max = 900) => sleep(min + Math.random() * (max - min));
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const insidePanel = (el) => !!host && (el === host || host.contains(el));

  function findIn(selectors) {
    for (const sel of selectors || []) {
      const els = Array.from(document.querySelectorAll(sel)).filter((e) => !insidePanel(e));
      const el = els.find(visible) || els[0];
      if (el) return el;
    }
    return null;
  }

  function waitFor(fn, timeout = 4000, every = 150) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        let v = null;
        try {
          v = fn();
        } catch {
          v = null;
        }
        if (v) return resolve(v);
        if (Date.now() - t0 > timeout) return resolve(null);
        setTimeout(tick, every);
      };
      tick();
    });
  }

  // Refuses to click anything whose label suggests a destructive or navigating action.
  function safeClick(el) {
    const label = `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`;
    if (FORBIDDEN_TEXT.test(label)) throw new Error(`refused to click "${label.trim().slice(0, 40)}"`);
    const link = el.closest("a[href]");
    if (link && link.getAttribute("href") && link.getAttribute("href") !== "#") throw new Error("refused to click a link");
    el.click();
  }

  const closeMenu = () =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));

  // ---------- full-size image capture (see gemini-main.js) ----------

  // gemini-main.js runs in the page's own world and posts every large Google-hosted image it
  // sees being fetched; the one the "Download full-sized image" button fetches is the real image.
  const captured = [];
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== "va-gemini-main" || !(d.blob instanceof Blob)) return;
    captured.push({ blob: d.blob, at: Date.now() });
  });

  // ---------- panel (shadow-DOM, same technique and CSS vars as content.js's buildPanel) ----------

  let host = null;
  const ui = {};

  function log(text, cls = "") {
    const li = document.createElement("li");
    li.textContent = text;
    li.className = cls;
    ui.list.appendChild(li);
    ui.list.scrollTop = ui.list.scrollHeight;
    return li;
  }

  function buildPanel() {
    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        .box{pointer-events:auto;font:14px/1.35 system-ui,-apple-system,sans-serif;background:#fff;color:#1c1f22;border:1px solid #0b7a75;
             border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.25);padding:10px 12px;max-width:520px;margin:0 auto}
        .head{display:flex;align-items:center;gap:8px}
        .head b{flex:1;color:#0b7a75}
        button{font:inherit;font-size:15px;padding:8px 12px;border-radius:10px;border:1px solid #dde1e4;background:#f5f7f8;color:inherit}
        ul{list-style:none;margin:8px 0 0;padding:0;max-height:34vh;overflow:auto}
        li{padding:2px 0}
        .ok{color:#0b6b3a}.warn{color:#8a5a00}
        .min .body{display:none}
        @media (prefers-color-scheme: dark){.box{background:#1b1f22;color:#e8eaec}button{background:#121416;border-color:#2c3135}
          .ok{color:#6fd39b}.warn{color:#f3c46b}.head b{color:#2bb3ab}}
      </style>
      <div class="box">
        <div class="head"><b>Annonces — Gemini</b><button class="toggle" aria-label="Minimise">–</button></div>
        <div class="body"><ul></ul></div>
      </div>`;
    const box = shadow.querySelector(".box");
    ui.list = shadow.querySelector("ul");
    shadow.querySelector(".toggle").onclick = (e) => {
      box.classList.toggle("min");
      e.target.textContent = box.classList.contains("min") ? "+" : "–";
    };
    document.documentElement.appendChild(host);
  }

  // ---------- the steps ----------

  function fileFromBase64(b64, name) {
    if (typeof b64 !== "string" || !b64) throw new Error(`no photo data for ${name}`);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
    return new File([bytes], name, { type: "image/jpeg" });
  }

  async function openToolsMenu() {
    const btn = await waitFor(() => findIn(SELECTORS.toolsButton), 20000);
    if (!btn) throw new Error('could not find Gemini\'s "+" (Upload and tools) button');
    safeClick(btn);
    await pause(700, 1100);
  }

  const findMenuItem = (re) => Array.from(document.querySelectorAll(SELECTORS.menuItem)).find((e) => re.test(e.textContent || "")) || null;

  // "Create image" is a toggle. Without it Gemini answers "I don't have access to that content".
  async function selectCreateImage() {
    await openToolsMenu();
    const item = await waitFor(() => findMenuItem(CREATE_IMAGE), 6000);
    if (!item) {
      closeMenu();
      throw new Error('could not find the "Create image" tool in Gemini\'s menu');
    }
    if (item.querySelector(SELECTORS.menuItemSelectedMark)) {
      closeMenu(); // already on
    } else {
      safeClick(item.querySelector("mat-list-item") || item);
    }
    await pause(600, 1000);
  }

  // Attaches the photos in order (the prompt says image 1 is the person, image 2 the garment).
  async function uploadPhotos(files) {
    await openToolsMenu();
    const input = await waitFor(() => findIn(SELECTORS.imageInput), 8000);
    if (!input) {
      closeMenu();
      throw new Error("could not find Gemini's upload input, even after opening the + menu");
    }
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const attached = await waitFor(() => document.querySelectorAll(SELECTORS.attachment).length >= files.length, 30000, 300);
    if (!attached) throw new Error("Gemini did not attach the photos");
    closeMenu();
    await pause(1200, 1800);
  }

  async function writePrompt(prompt) {
    const box = await waitFor(() => findIn(SELECTORS.textBox), 10000);
    if (!box) throw new Error("could not find Gemini's message box");
    box.focus();
    await pause(200, 400);
    if (box.isContentEditable) {
      // Gemini's Quill editor only reacts to real editing commands, not to textContent changes.
      document.execCommand("selectAll");
      document.execCommand("delete");
      for (let i = 0; i < prompt.length; i += 60) {
        document.execCommand("insertText", false, prompt.slice(i, i + 60));
        await sleep(30 + Math.random() * 50);
      }
      if (!(box.textContent || "").trim()) throw new Error("the prompt did not register in Gemini's message box");
    } else {
      const proto = box instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(box, prompt);
      box.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await pause(400, 800);
    return box;
  }

  async function send(box) {
    const btn = await waitFor(() => {
      const b = findIn(SELECTORS.sendButton);
      return b && !b.disabled && b.getAttribute("aria-disabled") !== "true" ? b : null;
    }, 30000, 300);
    if (btn) safeClick(btn);
    else box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
  }

  const lastResultImage = () => {
    const imgs = Array.from(document.querySelectorAll(SELECTORS.resultImage.join(","))).filter(
      (i) => !insidePanel(i) && i.complete && i.naturalWidth > 256,
    );
    return imgs[imgs.length - 1] || null;
  };

  async function waitForResultImage() {
    const img = await waitFor(lastResultImage, 150000, 1000);
    if (img) return img;
    const answers = document.querySelectorAll(SELECTORS.modelResponse);
    const text = (answers[answers.length - 1]?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(text ? `Gemini answered without an image: "${text}"` : "Gemini did not produce an image in time");
  }

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error("could not read the generated image"));
      reader.readAsDataURL(blob);
    });

  // Re-encodes to JPEG capped at MAX_SIDE, like the app does for every other photo.
  async function toJpeg(source) {
    const bitmap = source instanceof Blob ? await createImageBitmap(source) : null;
    const w = bitmap ? bitmap.width : source.naturalWidth;
    const h = bitmap ? bitmap.height : source.naturalHeight;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d").drawImage(bitmap || source, 0, 0, canvas.width, canvas.height);
    if (bitmap) bitmap.close();
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode the image"))), "image/jpeg", 0.92);
    });
  }

  // Full size first: the download button makes the page fetch the real image, which
  // gemini-main.js forwards. Falls back to the ~1024px preview on screen (canvas export works
  // because the preview is a same-origin blob: URL; fetch() on it is blocked by Gemini's CSP).
  async function captureImage(img) {
    const area = img.closest("generated-image") || img.closest("single-image") || document;
    const btn = Array.from(area.querySelectorAll("button")).find((b) => DOWNLOAD_FULL.test(b.getAttribute("aria-label") || ""));
    if (btn) {
      captured.length = 0;
      // Gemini only shows this button while the image is hovered.
      for (const type of ["mouseover", "mouseenter"]) area.dispatchEvent(new MouseEvent(type, { bubbles: true }));
      btn.click();
      const first = await waitFor(() => captured[0], 20000, 250);
      if (first) {
        await sleep(1500); // let a larger copy arrive if there is one
        const biggest = captured.reduce((a, b) => (b.blob.size > a.blob.size ? b : a));
        return { blob: await toJpeg(biggest.blob), how: "full size" };
      }
    }
    return { blob: await toJpeg(img), how: "preview size" };
  }

  async function reportResult(payload) {
    try {
      await chrome.runtime.sendMessage({ type: "GEMINI_JOB_RESULT", ...payload });
    } catch {
      // Background asleep or channel closed: nothing more to do. The app falls back to the
      // manual import.
    }
  }

  async function run(job) {
    buildPanel();
    log("Automating Gemini for this listing's model photo…");
    try {
      // Pose first, garment second: the prompt calls them "image 1" and "image 2".
      const files = [fileFromBase64(job.poseBase64, "1-modele.jpg"), fileFromBase64(job.garmentBase64, "2-vetement.jpg")];

      log('Switching on the "Create image" tool…');
      await selectCreateImage();

      log("Attaching the photos…");
      await uploadPhotos(files);

      log("Writing the prompt…");
      const box = await writePrompt(job.prompt || "");

      log("Sending. Gemini is generating the image, this can take a minute…");
      await send(box);

      const img = await waitForResultImage();

      log("Image ready, capturing it…");
      const { blob, how } = await captureImage(img);
      log(`Captured (${how}). Sending it back to the app.`, "ok");
      await reportResult({ resultBase64: await blobToBase64(blob) });
    } catch (e) {
      log(`Failed: ${e.message || e}`, "warn");
      await reportResult({ error: `Gemini automation failed: ${e.message || e}. Use the manual steps instead.` });
    }
  }

  // ---------- start ----------

  (async () => {
    let job;
    try {
      job = await chrome.runtime.sendMessage({ type: "GEMINI_JOB_POLL" });
    } catch {
      return; // background not reachable; nothing to do
    }
    if (!job) return; // no pending job for this page load
    run(job);
  })();
})();
