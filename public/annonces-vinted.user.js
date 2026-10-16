// ==UserScript==
// @name         Annonces → Vinted
// @namespace    https://github.com/Bldnr94/vinted-assistant
// @version      1.0.0
// @description  Fills the vinted.fr sell form with a listing sent from your Annonces app. It never presses publish.
// @match        https://www.vinted.fr/*
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM.setClipboard
// @grant        GM_setClipboard
// @connect      pages.dev
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==

// What this script does, and does not do:
// - It runs only in your own browser, on vinted.fr pages you opened while logged in.
// - On the sell page it shows a small "Annonces" panel. When you tap "Fill the form", it
//   reads the listing link the app copied to your clipboard, downloads the listing from your
//   own Cloudflare site, then types the fields and adds the photos through Vinted's normal form, at a human pace.
// - It never presses publish, never calls Vinted's API, never reads your cookies or password.
// - Anything it cannot fill is marked "do it by hand" in the panel.
//
// Vinted changes its page from time to time. If a field stops filling, tap "Form report",
// paste the report into the project thread, and the selectors below get fixed.

(function () {
  "use strict";

  // Ways to find each field, tried in order. Unverified guesses until the first form report.
  const FIELDS = {
    photos: ['input[type="file"][accept*="image"]', 'input[type="file"]'],
    title: ['[data-testid="title--input"]', 'input[name="title"]', "#title"],
    description: ['[data-testid="description--input"]', 'textarea[name="description"]', "#description"],
    category: ['[data-testid="catalog-select-dropdown-input"]', 'input[name="category"]', "#category"],
    brand: ['[data-testid="brand-select-dropdown-input"]', 'input[name="brand"]', "#brand"],
    size: ['[data-testid="size-select-dropdown-input"]', 'input[name="size"]', "#size"],
    condition: [
      '[data-testid="status-select-dropdown-input"]',
      '[data-testid="condition-select-dropdown-input"]',
      'input[name="status"]',
      'input[name="condition"]',
      "#status",
      "#condition",
    ],
    colour: ['[data-testid="color-select-dropdown-input"]', 'input[name="color"]', "#color"],
    material: ['[data-testid="material-select-dropdown-input"]', 'input[name="material"]', "#material"],
    price: ['[data-testid="price-input--input"]', 'input[name="price"]', "#price"],
  };

  // Label text to fall back on when no selector matches (French sell form).
  const LABELS = {
    title: ["titre"],
    description: ["decris ton article", "description"],
    category: ["categorie"],
    brand: ["marque"],
    size: ["taille"],
    condition: ["etat"],
    colour: ["couleur"],
    material: ["matiere"],
    price: ["prix"],
  };

  // Elements the script must never click: publishing, saving, or leaving the page.
  const FORBIDDEN_TEXT = /publi|mettre en ligne|ajouter l.article|enregistrer|sauvegarder|brouillon|upload|submit/i;

  const HANDOFF_URL = /^https:\/\/[a-z0-9.-]+\/api\/handoff\/[0-9a-f-]{36}$/i;

  let handoffUrl = "";
  let running = false;

  // ---------- small helpers ----------

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pause = (min = 350, max = 900) => sleep(min + Math.random() * (max - min));
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/\s+/g, " ")
      .trim();

  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const insidePanel = (el) => !!host && (el === host || host.contains(el));
  const insideChrome = (el) => !!el.closest("header, nav, footer");

  function find(field) {
    for (const sel of FIELDS[field] || []) {
      const els = Array.from(document.querySelectorAll(sel)).filter((e) => !insidePanel(e));
      const el = field === "photos" ? els[0] : els.find(visible);
      if (el) return el;
    }
    // Fallback: a <label> whose text starts with the field's name, and its control.
    for (const label of document.querySelectorAll("label")) {
      const text = norm(label.textContent);
      if (!(LABELS[field] || []).some((l) => text.startsWith(l))) continue;
      const el =
        (label.htmlFor && document.getElementById(label.htmlFor)) ||
        label.querySelector("input, textarea") ||
        label.parentElement?.querySelector("input, textarea");
      if (el && visible(el)) return el;
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
    const button = el.closest('button, [role="button"], input[type="submit"], a[href]');
    if (el.closest('[type="submit"]')) return true;
    if (button?.matches("a[href]")) {
      const href = button.getAttribute("href") || "";
      if (href && href !== "#" && !href.startsWith("javascript:")) return true;
    }
    if (button && FORBIDDEN_TEXT.test(button.textContent || button.value || "")) return true;
    return false;
  }

  // A tap, the way a finger produces it. Refuses publish/save buttons and links.
  function tap(el) {
    if (!el || isForbidden(el)) throw new Error("refused to click a publish, save or link element");
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerType: "touch", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerType: "touch", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  }

  // Sets an input's value so React notices it.
  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Types a value a few characters at a time.
  async function typeInto(el, value) {
    el.scrollIntoView({ block: "center" });
    el.focus();
    tap(el);
    setValue(el, "");
    const text = String(value);
    let i = 0;
    while (i < text.length) {
      i = Math.min(text.length, i + 2 + Math.floor(Math.random() * 5));
      setValue(el, text.slice(0, i));
      await sleep(25 + Math.random() * 60);
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await pause(150, 350);
    el.dispatchEvent(new FocusEvent("blur"));
  }

  // Deepest visible element whose whole text is `wanted` (or that passes `test`), outside the
  // page header and this panel. Prefers elements that appeared after `since`.
  function findOption(test, fresh) {
    const all = Array.from(document.querySelectorAll("body *")).filter((el) => {
      if (el.matches("script, style, input, textarea, option, svg, svg *")) return false;
      const t = el.textContent || "";
      if (!t || t.length > 120 || !test(norm(t), el)) return false;
      return !insidePanel(el) && !insideChrome(el) && visible(el);
    });
    // Keep the deepest matches only.
    const deepest = all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
    const safe = deepest.filter((el) => !isForbidden(el));
    return safe.find((el) => fresh.has(el)) || safe[0] || null;
  }

  // Watches the page for new elements, so a dropdown's options are preferred over
  // same-named text elsewhere on the page.
  function watchAdded() {
    const fresh = new Set();
    const obs = new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes)
          if (n.nodeType === 1) {
            fresh.add(n);
            n.querySelectorAll?.("*").forEach((c) => fresh.add(c));
          }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return { fresh, stop: () => obs.disconnect() };
  }

  async function openDropdown(input) {
    const w = watchAdded();
    tap(input);
    input.focus();
    await pause(500, 900);
    return w;
  }

  function closeDropdown(input) {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    document.activeElement?.blur?.();
  }

  // A search box inside an open dropdown, or the field itself when it is typeable.
  function searchBox(input, fresh) {
    const active = document.activeElement;
    if (active && active !== input && active.matches?.("input") && !insidePanel(active)) return active;
    const added = Array.from(fresh).find((el) => el.matches?.('input[type="text"], input[type="search"], input:not([type])') && visible(el));
    if (added) return added;
    return input.readOnly ? null : input;
  }

  // ---------- one step per field ----------

  async function fillText(field, value) {
    if (!value) return "empty in the app";
    const el = await waitFor(() => find(field));
    if (!el) return "field not found";
    await typeInto(el, value);
    return norm(el.value) === norm(value) ? "ok" : "check it";
  }

  async function fillPhotos(photos) {
    if (!photos.length) return "no photos";
    const files = photos.map((b64, i) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
      return new File([bytes], `photo-${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" });
    });
    const put = (input, list) => {
      const dt = new DataTransfer();
      list.forEach((f) => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    let input = await waitFor(() => find("photos"), 6000);
    if (!input) return "photo input not found";
    if (input.multiple) {
      put(input, files);
      await sleep(1500 + files.length * 400);
    } else {
      for (const f of files) {
        input = (await waitFor(() => find("photos"), 4000)) || input;
        put(input, [f]);
        await pause(1200, 2000);
      }
    }
    return `ok, ${files.length} sent; check the order`;
  }

  async function fillCategory(path) {
    const parts = String(path || "")
      .split(">")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return "empty in the app";
    const input = await waitFor(() => find("category"));
    if (!input) return "field not found";
    let w = await openDropdown(input);
    try {
      for (let i = 0; i < parts.length; i++) {
        const want = norm(parts[i]);
        // "Vêtements" is often skipped by Vinted's tree; tolerate a missing level.
        const opt = await waitFor(() => findOption((t) => t === want, w.fresh), 2500);
        if (!opt) {
          if (i > 0 && i < parts.length - 1) continue;
          return `stopped at "${parts[i]}"`;
        }
        w.stop();
        w = watchAdded();
        tap(opt);
        await pause(600, 1100);
      }
      return "ok";
    } finally {
      w.stop();
    }
  }

  // Picks options in a list-type dropdown. `pick(texts)` gets the visible option texts and
  // returns the ones to tap.
  async function fillChoice(field, wanted, { search = false, multi = false } = {}) {
    const wants = (Array.isArray(wanted) ? wanted : [wanted]).filter(Boolean);
    if (!wants.length) return "empty in the app";
    const input = await waitFor(() => find(field), 2500);
    if (!input) return field === "material" || field === "size" ? "not in this category's form" : "field not found";
    const w = await openDropdown(input);
    const done = [];
    try {
      for (const want of wants) {
        if (search) {
          const box = searchBox(input, w.fresh);
          if (box) {
            await typeInto(box, want);
            await pause(700, 1200);
          }
        }
        const opt = await waitFor(() => bestOption(want, w.fresh), 2500);
        if (!opt) continue;
        tap(opt);
        done.push(want);
        await pause(400, 800);
        if (!multi) break;
      }
    } finally {
      w.stop();
      if (multi || !done.length) closeDropdown(input);
    }
    if (!done.length) return `no option matched "${wants.join(", ")}"`;
    return done.length < wants.length ? `ok for ${done.join(", ")} only` : "ok";
  }

  // Exact text first, then "starts with" (condition options carry a description), then the
  // option sharing most tokens (sizes like "M / FR 38" against "M / 38 / 10").
  function bestOption(want, fresh) {
    const w = norm(want);
    const exact = findOption((t) => t === w, fresh);
    if (exact) return exact;
    const starts = findOption((t) => t.startsWith(w + " ") || t.startsWith(w + "\n"), fresh);
    if (starts && fresh.has(starts)) return starts;
    const tokens = w.split(/[\s/,()-]+/).filter((x) => x && x !== "fr" && x !== "eu" && x !== "taille");
    if (!tokens.length) return null;
    let best = null;
    let bestScore = 0;
    let tie = false;
    for (const el of fresh) {
      if (!el.isConnected || !visible(el) || insidePanel(el) || isForbidden(el)) continue;
      const t = norm(el.textContent);
      if (!t || t.length > 40 || el.children.length > 2) continue;
      const opt = t.split(/[\s/,()-]+/).filter(Boolean);
      const score = tokens.filter((x) => opt.includes(x)).length;
      if (score > bestScore) {
        best = el;
        bestScore = score;
        tie = false;
      } else if (score === bestScore && score > 0 && best && !best.contains(el) && !el.contains(best) && norm(best.textContent) !== t) {
        tie = true;
      }
    }
    return bestScore > 0 && !tie ? best : null;
  }

  // "60% coton, 40% polyester" -> ["Coton", "Polyester"] as Vinted names them.
  function materialNames(text) {
    return String(text || "")
      .split(/[,;/+]|\bet\b/)
      .map((s) => s.replace(/[\d%.]+/g, "").trim())
      .filter((s) => s.length > 2)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
      .slice(0, 3);
  }

  // ---------- the run ----------

  async function fetchPackage(url) {
    const xhr = (typeof GM !== "undefined" && GM.xmlHttpRequest) || (typeof GM_xmlhttpRequest !== "undefined" && GM_xmlhttpRequest);
    if (!xhr) throw new Error("This userscript manager does not offer GM.xmlHttpRequest.");
    const res = await new Promise((resolve, reject) => {
      const r = xhr({
        method: "GET",
        url,
        responseType: "text",
        timeout: 60000,
        onload: resolve,
        onerror: () => reject(new Error("Could not reach the app. Check your connection.")),
        ontimeout: () => reject(new Error("The app took too long to answer.")),
      });
      if (r && typeof r.then === "function") r.then(resolve, reject);
    });
    let body;
    try {
      body = JSON.parse(res.responseText);
    } catch {
      throw new Error(
        res.status === 200
          ? "The app answered with a web page, not the listing. Bypass /api/handoff in Cloudflare Access (see README)."
          : `The app answered ${res.status}.`,
      );
    }
    if (res.status !== 200) throw new Error(body.error || `The app answered ${res.status}.`);
    return body;
  }

  // The app copies the link when you tap "Open vinted.fr". Reading it needs your tap,
  // and on iPhone a tap on the "Paste" bubble.
  async function readLink() {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = prompt("Paste the link from the app:") || "";
    }
    return text.trim();
  }

  async function run() {
    if (running) return;
    const link = await readLink();
    if (HANDOFF_URL.test(link)) handoffUrl = link;
    if (!HANDOFF_URL.test(handoffUrl)) {
      log("No listing link on the clipboard. In the app tap Send to vinted.fr, then Open vinted.fr.", "warn");
      return;
    }
    running = true;
    ui.fill.disabled = true;
    ui.list.textContent = "";
    try {
      log("Downloading the listing…");
      const { listing: l, photos } = await fetchPackage(handoffUrl);
      log(`Got "${l.title}" with ${photos.length} photos.`, "ok");

      const steps = [
        ["Photos", () => fillPhotos(photos)],
        ["Titre", () => fillText("title", l.title)],
        ["Description", () => fillText("description", l.description)],
        ["Catégorie", () => fillCategory(l.category_path)],
        ["Marque", () => fillChoice("brand", l.brand, { search: true })],
        ["Taille", () => fillChoice("size", l.size)],
        ["État", () => fillChoice("condition", l.condition)],
        ["Couleur", () => fillChoice("colour", (l.colours || []).slice(0, 2), { multi: true })],
        ["Matière", () => fillChoice("material", materialNames(l.materials), { multi: true })],
        ["Prix", () => fillText("price", l.price ? String(l.price).replace(".", ",") : "")],
      ];
      for (const [name, step] of steps) {
        const row = log(`${name}: filling…`);
        let result;
        try {
          result = await step();
        } catch (e) {
          result = `error: ${e.message}`;
        }
        const ok = result === "ok" || result.startsWith("ok,");
        const skip = result === "empty in the app" || result === "not in this category's form";
        row.textContent = `${ok ? "✓" : skip ? "–" : "✋"} ${name}: ${ok ? result.replace(/^ok,? ?/, "") || "filled" : result}`;
        row.className = ok ? "ok" : skip ? "" : "warn";
        await pause();
      }
      log("Done. Check every field and the photo order, then press publish yourself.", "ok");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      log(e.message, "warn");
    } finally {
      running = false;
      ui.fill.disabled = false;
    }
  }

  // Lists the form's fields so selectors can be fixed from a real page.
  function formReport() {
    const root = document.querySelector("form") || document.querySelector("main") || document.body;
    const rows = [];
    root.querySelectorAll('input, textarea, select, button, [data-testid], [role="button"], [role="combobox"]').forEach((el) => {
      if (insidePanel(el) || rows.length > 250) return;
      const label = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      rows.push(
        [
          el.tagName.toLowerCase(),
          el.type && `type=${el.type}`,
          el.name && `name=${el.name}`,
          el.id && `id=${el.id}`,
          el.dataset?.testid && `testid=${el.dataset.testid}`,
          el.placeholder && `placeholder=${el.placeholder}`,
          el.getAttribute("aria-label") && `aria=${el.getAttribute("aria-label")}`,
          el.readOnly && "readonly",
          el.multiple && "multiple",
          label && `label=${norm(label.textContent).slice(0, 40)}`,
          !["input", "textarea"].includes(el.tagName.toLowerCase()) && `text=${norm(el.textContent).slice(0, 40)}`,
        ]
          .filter(Boolean)
          .join(" | "),
      );
    });
    const text = `Annonces form report, ${location.pathname}, ${navigator.userAgent}\n${rows.join("\n")}`;
    const copy = (typeof GM !== "undefined" && GM.setClipboard) || (typeof GM_setClipboard !== "undefined" && GM_setClipboard);
    Promise.resolve()
      .then(() => (copy ? copy(text) : navigator.clipboard.writeText(text)))
      .then(
        () => log(`Form report copied (${rows.length} elements). Paste it into the project thread.`, "ok"),
        () => {
          ui.report.value = text;
          ui.report.hidden = false;
          ui.report.select();
          log("Could not copy. Select the text in the box and copy it.", "warn");
        },
      );
  }

  // ---------- panel ----------

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
        .primary{background:#0b7a75;color:#fff;border-color:#0b7a75;font-weight:600}
        button:disabled{opacity:.5}
        .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
        ul{list-style:none;margin:8px 0 0;padding:0;max-height:34vh;overflow:auto}
        li{padding:2px 0}
        .ok{color:#0b6b3a}.warn{color:#8a5a00}
        textarea{width:100%;height:120px;margin-top:8px;font:12px monospace}
        .min .body{display:none}
        @media (prefers-color-scheme: dark){.box{background:#1b1f22;color:#e8eaec}button{background:#121416;border-color:#2c3135}
          .ok{color:#6fd39b}.warn{color:#f3c46b}.head b{color:#2bb3ab}}
      </style>
      <div class="box">
        <div class="head"><b>Annonces</b><button class="toggle" aria-label="Minimise">–</button></div>
        <div class="body">
          <div class="row">
            <button class="primary fill">Fill the form</button>
            <button class="rep">Form report</button>
          </div>
          <ul></ul>
          <textarea class="report" hidden readonly></textarea>
        </div>
      </div>`;
    const box = shadow.querySelector(".box");
    ui.fill = shadow.querySelector(".fill");
    ui.list = shadow.querySelector("ul");
    ui.report = shadow.querySelector(".report");
    ui.fill.onclick = run;
    shadow.querySelector(".rep").onclick = formReport;
    shadow.querySelector(".toggle").onclick = (e) => {
      box.classList.toggle("min");
      e.target.textContent = box.classList.contains("min") ? "+" : "–";
    };
    document.documentElement.appendChild(host);
  }

  // ---------- start ----------

  const onSellPage = () => /^\/items\/new\b/.test(location.pathname);

  function sync() {
    if (onSellPage() && !host) {
      buildPanel();
      log("Tap Fill the form, then Paste if your phone asks.");
    } else if (!onSellPage() && host && !running) {
      host.remove();
      host = null;
    }
  }

  sync();
  // Vinted is a single-page app: watch for moving to and from the sell page.
  setInterval(sync, 1000);
})();
