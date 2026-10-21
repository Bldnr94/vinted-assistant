// Annonces → Vinted — Gemini automation content script
//
// Drives the Gemini web app (https://gemini.google.com/*) to reproduce, by hand-equivalent
// clicks and keystrokes, the manual flow described in src/ModelPhotos.tsx's Gemini fallback:
// upload the garment photo + a pose photo, type a prompt, wait for the generated image, and
// hand it back. This exists so the user doesn't have to do that by hand every time — Gemini's
// API costs money, but the free Google AI plan covers the web UI the user is already logged
// into.
//
// Shares the "relay contract" with extension/bridge-content.js (running on the *.pages.dev
// app tab) via chrome.storage.local key "geminiJob" and a few chrome.runtime message types
// handled in background.js. This file only ever touches:
//   - the chrome.storage.local job object (read via GEMINI_JOB_POLL, write the result via
//     GEMINI_JOB_RESULT — never written directly)
//   - Gemini's own chat UI: the upload input, the message text box, and (if needed) a send
//     button
// It never clicks anything that deletes, shares, exports, or signs out, and never navigates
// away from the page.
//
// Gemini's DOM is unresearched territory: no prior session has automated it, so the selectors
// below are best-effort guesses built the same defensive way content.js handles vinted.fr's
// uncertain markup — an ordered list of candidates per target, with heuristic fallbacks. If
// Gemini changes its markup (or the guesses are simply wrong), this fails safely: every step is
// wrapped so a GEMINI_JOB_RESULT with an error is always sent, and the existing manual "import
// Gemini result" file picker in the app remains the fallback path.

(function () {
  "use strict";

  if (!/^https:\/\/gemini\.google\.com\//.test(location.href)) return;

  // Ways to find each target, tried in order. None of these have been verified against a
  // live gemini.google.com page — flagged "unverified, needs live testing" in the report back.
  const FIELDS = {
    // Gemini's chat composer accepts file uploads through a hidden <input type="file">,
    // usually revealed by a "+"/paperclip toolbar button. We never click that toolbar button
    // ourselves (too easy to mis-click something destructive); instead we look for the input
    // directly, since hidden file inputs are normally present in the DOM even before the
    // toolbar opens them.
    fileInput: [
      'input[type="file"][multiple]',
      'input[type="file"]',
    ],
    // The chat text box. Gemini's composer is known (from public reporting) to use a
    // contenteditable rich-text box rather than a <textarea>, but both are tried.
    textBox: [
      'rich-textarea div[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      "textarea",
    ],
    // A send button near the composer, used only if Enter doesn't submit.
    sendButton: [
      'button[aria-label*="Send" i]',
      'button[aria-label*="Envoyer" i]',
      'button[data-testid*="send" i]',
    ],
  };

  // Text that must never be clicked — Gemini's own vocabulary for destructive/navigational
  // actions, English and French (the user's Google account may be in either).
  const FORBIDDEN_TEXT =
    /delete|remove|clear conversation|clear chat|share|export|settings|sign out|log out|supprimer|effacer|partager|exporter|param(e|è)tres|d(e|é)connexion/i;

  // ---------- small helpers (ported near-verbatim from content.js) ----------

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

  function isForbidden(el) {
    const button = el.closest('button, [role="button"], a[href]');
    if (button?.matches("a[href]")) {
      const href = button.getAttribute("href") || "";
      if (href && href !== "#" && !href.startsWith("javascript:")) return true;
    }
    if (button && FORBIDDEN_TEXT.test(button.textContent || "")) return true;
    if (button && FORBIDDEN_TEXT.test(button.getAttribute("aria-label") || "")) return true;
    return false;
  }

  // A tap, the way a finger produces it. Refuses forbidden elements and links. Ported from
  // content.js's tap().
  function tap(el) {
    if (!el || isForbidden(el)) throw new Error("refused to click a forbidden element");
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    const fire = (make) => {
      try {
        el.dispatchEvent(make());
      } catch {
        // ignore unsupported event constructors
      }
    };
    fire(() => new PointerEvent("pointerdown", { ...opts, pointerType: "mouse", isPrimary: true }));
    fire(() => new MouseEvent("mousedown", opts));
    fire(() => new PointerEvent("pointerup", { ...opts, pointerType: "mouse", isPrimary: true }));
    fire(() => new MouseEvent("mouseup", opts));
    if (typeof el.click === "function") el.click();
    else fire(() => new MouseEvent("click", opts));
  }

  // Sets a <textarea>/<input>'s value via the native setter so a React-bound listener notices.
  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Types a value a few characters at a time, at a human pace. Handles both a plain
  // textarea/input (native setter trick) and a contenteditable box (textContent + input event),
  // since Gemini's composer is most likely contenteditable.
  async function typeInto(el, value) {
    el.scrollIntoView({ block: "center" });
    el.focus();
    tap(el);
    const isEditable = el.isContentEditable;
    if (isEditable) el.textContent = "";
    else setValue(el, "");
    const text = String(value);
    let i = 0;
    while (i < text.length) {
      i = Math.min(text.length, i + 2 + Math.floor(Math.random() * 5));
      const slice = text.slice(0, i);
      if (isEditable) {
        el.textContent = slice;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: slice }));
      } else {
        setValue(el, slice);
      }
      await sleep(25 + Math.random() * 60);
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await pause(150, 350);
  }

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
    host.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        .box{font:14px/1.35 system-ui,-apple-system,sans-serif;background:#fff;color:#1c1f22;border:1px solid #0b7a75;
             border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.25);padding:10px 12px;max-width:520px;margin:0 auto}
        .head{display:flex;align-items:center;gap:8px}
        .head b{flex:1;color:#0b7a75}
        button{font:inherit;font-size:15px;padding:8px 12px;border-radius:10px;border:1px solid #dde1e4;background:#f5f7f8;color:inherit}
        button:disabled{opacity:.5}
        ul{list-style:none;margin:8px 0 0;padding:0;max-height:34vh;overflow:auto}
        li{padding:2px 0}
        .ok{color:#0b6b3a}.warn{color:#8a5a00}
        .min .body{display:none}
        @media (prefers-color-scheme: dark){.box{background:#1b1f22;color:#e8eaec}button{background:#121416;border-color:#2c3135}
          .ok{color:#6fd39b}.warn{color:#f3c46b}.head b{color:#2bb3ab}}
      </style>
      <div class="box">
        <div class="head"><b>Annonces — Gemini</b><button class="toggle" aria-label="Minimise">–</button></div>
        <div class="body">
          <ul></ul>
        </div>
      </div>`;
    const box = shadow.querySelector(".box");
    ui.list = shadow.querySelector("ul");
    shadow.querySelector(".toggle").onclick = (e) => {
      box.classList.toggle("min");
      e.target.textContent = box.classList.contains("min") ? "+" : "–";
    };
    document.documentElement.appendChild(host);
  }

  // ---------- the job ----------

  function fileFromBase64(b64, name) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
    return new File([bytes], name, { type: "image/jpeg" });
  }

  async function uploadPhotos(garmentFile, poseFile) {
    const input = await waitFor(() => findIn(FIELDS.fileInput), 15000);
    if (!input) throw new Error("could not find Gemini's upload input");
    const dt = new DataTransfer();
    dt.items.add(garmentFile);
    dt.items.add(poseFile);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    // Give Gemini time to show the attached-image thumbnails before we type/submit.
    await pause(1500, 2500);
  }

  async function submitPrompt(prompt) {
    const box = await waitFor(() => findIn(FIELDS.textBox), 10000);
    if (!box) throw new Error("could not find Gemini's chat text box");
    await typeInto(box, prompt);
    await pause(300, 600);
    // Enter submits most chat UIs, including (per public reporting) Gemini's own composer,
    // and needs no button-selector guess at all — try it first.
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    box.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    await pause(800, 1200);
    // If Enter didn't clear the box, Gemini likely didn't submit; fall back to a send button.
    const stillFull = box.isContentEditable ? (box.textContent || "").trim().length > 0 : (box.value || "").trim().length > 0;
    if (stillFull) {
      const send = findIn(FIELDS.sendButton);
      if (send) tap(send);
    }
  }

  // Watches for a freshly-added <img> in the response area, preferring new elements over any
  // pre-existing image on the page (e.g. an avatar). Ported from content.js's watchAdded().
  function watchAdded() {
    const fresh = new Set();
    const obs = new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes)
          if (n.nodeType === 1) {
            fresh.add(n);
            n.querySelectorAll?.("img").forEach((c) => fresh.add(c));
            if (n.tagName === "IMG") fresh.add(n);
          }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return { fresh, stop: () => obs.disconnect() };
  }

  async function waitForResultImage() {
    const w = watchAdded();
    try {
      // Generous timeout: image generation is slow.
      const img = await waitFor(
        () => {
          for (const el of w.fresh) {
            if (el.tagName === "IMG" && el.isConnected && visible(el) && !insidePanel(el) && el.naturalWidth > 32) return el;
          }
          return null;
        },
        90000,
        400,
      );
      return img;
    } finally {
      w.stop();
    }
  }

  async function extractImageBase64(img) {
    // Primary: fetch the image's own src with credentials — runs in gemini.google.com's own
    // origin, so this reuses the page's cookies and avoids any canvas taint issue.
    try {
      const res = await fetch(img.src, { credentials: "include" });
      const blob = await res.blob();
      return await blobToBase64(blob);
    } catch {
      // Fallback: draw the already-rendered <img> onto a canvas. This still works even if the
      // fetch is blocked, unless the image is cross-origin without CORS headers (tainted
      // canvas) — in which case toBlob() throws and we surface a clear error below.
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas produced no blob"))), "image/jpeg", 0.92);
      });
      return await blobToBase64(blob);
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error("could not read the generated image"));
      reader.readAsDataURL(blob);
    });
  }

  async function reportResult(payload) {
    try {
      await chrome.runtime.sendMessage({ type: "GEMINI_JOB_RESULT", ...payload });
    } catch {
      // Nothing more we can do — background may be asleep or the message channel closed.
      // The job is left as "running" in storage; a page reload will not re-pick it up
      // (GEMINI_JOB_POLL only returns "pending" jobs), so the user falls back to the
      // existing manual import flow.
    }
  }

  async function run(job) {
    buildPanel();
    log("Automating Gemini for this listing's model photo…");
    try {
      log("Preparing photos…");
      const garmentFile = fileFromBase64(job.garmentBase64, "garment.jpg");
      const poseFile = fileFromBase64(job.poseBase64, "pose.jpg");

      log("Uploading photos…");
      await uploadPhotos(garmentFile, poseFile);

      log("Typing the prompt…");
      await submitPrompt(job.prompt || "");

      log("Waiting for Gemini to generate the image… this can take a while.");
      const img = await waitForResultImage();
      if (!img) {
        log("No image appeared in time.", "warn");
        await reportResult({ error: "Gemini did not produce an image in time. Use the manual import instead." });
        return;
      }

      log("Capturing the result…");
      let resultBase64;
      try {
        resultBase64 = await extractImageBase64(img);
      } catch {
        log("Could not capture the generated image.", "warn");
        await reportResult({ error: "Could not capture the generated image automatically. Use the manual import instead." });
        return;
      }

      log("Done — sending the image back to the app.", "ok");
      await reportResult({ resultBase64 });
    } catch (e) {
      log(`Failed: ${e.message || e}`, "warn");
      await reportResult({ error: `Gemini automation failed: ${e.message || e}. Use the manual import instead.` });
    }
  }

  // ---------- start ----------

  (async () => {
    let job;
    try {
      job = await chrome.runtime.sendMessage({ type: "GEMINI_JOB_POLL" });
    } catch {
      return; // background not reachable; nothing to do silently
    }
    if (!job) return; // no pending job for this page load
    run(job);
  })();
})();
