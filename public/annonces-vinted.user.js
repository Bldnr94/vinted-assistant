// ==UserScript==
// @name         Annonces → Vinted
// @namespace    https://github.com/Bldnr94/vinted-assistant
// @version      1.0.6
// @description  Fills the vinted.fr sell form with a listing sent from your Annonces app. It never presses publish.
// @match        https://www.vinted.fr/*
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM.setClipboard
// @grant        GM_setClipboard
// @connect      pages.dev
// @connect      *
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Bldnr94/vinted-assistant/main/public/annonces-vinted.user.js
// @downloadURL  https://raw.githubusercontent.com/Bldnr94/vinted-assistant/main/public/annonces-vinted.user.js
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

  // Ways to find each field, tried in order. The first selector of each is what vinted.fr's
  // sell form used in October 2026 (from form reports); the rest are fallbacks.
  const FIELDS = {
    photos: ['[data-testid="add-photos-input"]', 'input[type="file"][accept*="image"]', 'input[type="file"]'],
    title: ['[data-testid="title--input"]', 'input[name="title"]', "#title"],
    description: ['[data-testid="description--input"]', 'textarea[name="description"]', "#description"],
    category: ['[data-testid="catalog-select-dropdown-input"]', 'input[name="category"]', "#category"],
    brand: ['[data-testid="brand-select-dropdown-input"]', 'input[name="brand"]', "#brand"],
    size: ['[data-testid="category-size-single-grid_chips-input"]', 'input[name="size"]', "#size"],
    condition: ['[data-testid="category-condition-single-list-input"]', 'input[name="condition"]', "#condition"],
    colour: ['[data-testid="color-select-dropdown-input"]', 'input[name="color"]', "#color"],
    material: ['[data-testid="category-material-multi-list-input"]', 'input[name="material"]', "#material"],
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
    material: ["materiau", "matiere"],
    price: ["prix"],
  };

  // Search boxes inside the category and brand pickers.
  const SEARCH = {
    category: ['#catalog-search-input', 'input[name="catalog-search-input"]'],
    brand: ['[data-testid="brand-search--input"]', "#brand-search-input"],
  };

  // The "Fait" button that closes a picker and keeps the choice.
  const PICKER_DONE = '[data-testid="input-dropdown-save-button"]';

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
      .replace(/\s*&\s*/g, " et ")
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
    // vinted.fr's publish button is a plain type="button" reading just "Ajouter".
    if (el.closest('[data-testid^="upload-form-save"]')) return true;
    if (button && /^ajouter$/i.test(norm(button.textContent))) return true;
    return false;
  }

  // A tap, the way a finger produces it. Refuses publish/save buttons and links.
  function tap(el) {
    if (!el || isForbidden(el)) throw new Error("refused to click a publish, save or link element");
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    // No "view" member: in Tampermonkey on Firefox, the script's window is a sandbox wrapper that
    // the event constructors reject.
    const opts = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    const fire = (make) => {
      try {
        el.dispatchEvent(make());
      } catch {
        // A browser without PointerEvent: the mouse events below still do the job.
      }
    };
    fire(() => new PointerEvent("pointerdown", { ...opts, pointerType: "touch", isPrimary: true }));
    fire(() => new MouseEvent("mousedown", opts));
    fire(() => new PointerEvent("pointerup", { ...opts, pointerType: "touch", isPrimary: true }));
    fire(() => new MouseEvent("mouseup", opts));
    if (typeof el.click === "function") el.click();
    else fire(() => new MouseEvent("click", opts));
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

  // Closes a picker with its "Fait" button when it has one, which keeps the choice.
  async function closeDropdown(input) {
    const done = Array.from(document.querySelectorAll(PICKER_DONE)).find(visible);
    if (done) tap(done);
    else input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    document.activeElement?.blur?.();
    await pause(300, 600);
  }

  // Taps an option. Picker rows hold a radio or checkbox next to the text; tapping that
  // input is what selects the row.
  function pick(opt) {
    const row = opt.closest("li") || opt;
    const box = row.querySelector('input[type="radio"], input[type="checkbox"]');
    tap(box || opt);
  }

  const findIn = (selectors) => {
    for (const sel of selectors || []) {
      const el = Array.from(document.querySelectorAll(sel)).find(visible);
      if (el) return el;
    }
    return null;
  };

  // A search box inside an open dropdown, or the field itself when it is typeable.
  function searchBox(input, fresh, field) {
    const known = findIn(SEARCH[field]);
    if (known) return known;
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

  // Walks Vinted's category tree level by level ("Femmes", then "Vêtements", ...). A level
  // that isn't there is skipped; if the tree runs out, the picker's search box is used
  // with the last part of the path.
  async function fillCategory(path) {
    const parts = String(path || "")
      .split(">")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return "empty in the app";
    const input = await waitFor(() => find("category"));
    if (!input) return "field not found";
    let w = await openDropdown(input);
    let reached = 0;
    try {
      for (let i = 0; i < parts.length; i++) {
        const want = norm(parts[i]);
        const opt = await waitFor(() => findOption((t) => t === want, w.fresh), 2500);
        if (!opt) {
          if (i > 0 && i < parts.length - 1) continue;
          break;
        }
        w.stop();
        w = watchAdded();
        pick(opt);
        reached = i + 1;
        await pause(600, 1100);
      }
      if (reached < parts.length) {
        const leaf = parts[parts.length - 1];
        const box = findIn(SEARCH.category);
        const opt = box && (await searchCategory(box, leaf, w.fresh));
        if (!opt) {
          // Clears the failed search so the list shows categories again.
          if (box) setValue(box, "");
          return waitForOwnPick(input, leaf);
        }
        pick(opt);
        await pause(600, 1000);
      }
      if (norm(input.value)) {
        if (Array.from(document.querySelectorAll(PICKER_DONE)).some(visible)) await closeDropdown(input);
        return "ok";
      }
      await closeDropdown(input);
      return norm(input.value) ? "ok" : "check it";
    } finally {
      w.stop();
    }
  }

  // Types the leaf into the category search and takes the one result naming it, also as
  // part of a longer name ("Bombers" finds "Vestes bombers") or in the singular.
  async function searchCategory(box, leaf, fresh) {
    await typeInto(box, leaf);
    await pause(900, 1400);
    const best = await waitFor(() => bestOption(leaf, fresh), 4000);
    if (best) return best;
    const words = norm(leaf)
      .split(/[\s/,()-]+/)
      .filter((x) => x.length > 2)
      .map((x) => x.replace(/s$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!words.length) return null;
    const hit = (t) => t.length < 60 && words.every((x) => new RegExp(`(^|[^a-z])${x}s?([^a-z]|$)`).test(t));
    const rows = new Set();
    for (const el of fresh) {
      if (!el.isConnected || !visible(el) || insidePanel(el) || isForbidden(el)) continue;
      if (el.children.length > 2 || !hit(norm(el.textContent))) continue;
      rows.add(el.closest("li") || el);
    }
    return rows.size === 1 ? [...rows][0] : null;
  }

  // When the script can't find the category, Victor picks it in the open list and the
  // other fields (brand, condition, colour...), which only appear after, still get filled.
  async function waitForOwnPick(input, leaf) {
    const row = log(`✋ Catégorie: no match for "${leaf}". Pick it yourself in the list (minimise this panel if it's in the way); I'll carry on once it's set.`, "warn");
    const picked = await waitFor(() => norm((find("category") || input).value), 120000, 500);
    row.remove();
    if (!picked) return `no category matched "${leaf}", and none was picked within 2 minutes`;
    await pause(800, 1200);
    if (Array.from(document.querySelectorAll(PICKER_DONE)).some(visible)) await closeDropdown(input);
    return `ok, picked by you: ${(find("category") || input).value} (the app said "${leaf}")`;
  }

  // Picks options in a list-type dropdown. `pick(texts)` gets the visible option texts and
  // returns the ones to tap.
  async function fillChoice(field, wanted, { search = false, multi = false } = {}) {
    const wants = (Array.isArray(wanted) ? wanted : [wanted]).filter(Boolean);
    if (!wants.length) return "empty in the app";
    // Brand, size, condition, colour and material appear only after a category is picked.
    const input = await waitFor(() => find(field), 6000);
    if (!input) return field === "material" || field === "size" ? "not in this category's form" : "field not found";
    const w = await openDropdown(input);
    const done = [];
    try {
      for (const want of wants) {
        if (search) {
          const box = searchBox(input, w.fresh, field);
          if (box) {
            await typeInto(box, want);
            await pause(700, 1200);
          }
        }
        const opt = await waitFor(() => bestOption(want, w.fresh), 2500);
        if (!opt) continue;
        pick(opt);
        done.push(want);
        await pause(400, 800);
        if (!multi) break;
      }
    } finally {
      w.stop();
      await pause(400, 700);
      // Single-choice pickers usually close on their own; close any that stayed open.
      if (multi || !done.length || Array.from(document.querySelectorAll(PICKER_DONE)).some(visible)) {
        await closeDropdown(input);
      }
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
    // Condition rows read "tres bon etatpeu porte...": title and description run together.
    const starts = findOption((t) => t.length > w.length && t.startsWith(w), fresh);
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
      log("Done. Pick the parcel size, check every field and the photo order, then press Ajouter yourself.", "ok");
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
    // The whole page except the site header, its search bar and this panel; the sell form
    // is not necessarily the first <form> on the page.
    const skip = (el) =>
      insidePanel(el) ||
      insideChrome(el) ||
      /^search/.test(el.dataset?.testid || "") ||
      el.matches("script, style") ||
      !!el.closest('#onetrust-consent-sdk, [id^="onetrust"], [id^="ot-"]');
    const rows = [];
    const seen = new Set();
    document.body
      .querySelectorAll(
        'input, textarea, select, button, label, h1, h2, h3, li, [data-testid], [role="button"], [role="combobox"], [role="option"], [role="listbox"]',
      )
      .forEach((el) => {
        if (skip(el) || rows.length > 400) return;
        const tag = el.tagName.toLowerCase();
        const label = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        const row = [
          tag,
          el.type && `type=${el.type}`,
          el.name && `name=${el.name}`,
          el.id && `id=${el.id}`,
          el.dataset?.testid && `testid=${el.dataset.testid}`,
          el.placeholder && `placeholder=${el.placeholder}`,
          el.getAttribute("aria-label") && `aria=${el.getAttribute("aria-label")}`,
          el.getAttribute("accept") && `accept=${el.getAttribute("accept")}`,
          el.readOnly && "readonly",
          el.multiple && "multiple",
          !visible(el) && "hidden",
          label && `label=${norm(label.textContent).slice(0, 40)}`,
          !["input", "textarea"].includes(tag) && `text=${norm(el.textContent).slice(0, 50)}`,
        ]
          .filter(Boolean)
          .join(" | ");
        if (!seen.has(row)) {
          seen.add(row);
          rows.push(row);
        }
      });
    const page = norm(document.body.innerText).slice(0, 300);
    rows.unshift(`page text: ${page}`);
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
    // Waits 5 seconds, so you can open a dropdown before the page is read.
    shadow.querySelector(".rep").onclick = () => {
      log("Reading the page in 5 seconds. Open a dropdown now if you want it included.");
      setTimeout(formReport, 5000);
    };
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
