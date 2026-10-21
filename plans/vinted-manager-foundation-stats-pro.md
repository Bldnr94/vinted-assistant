# Blueprint: Foundation, Profit & Stats, Pro toolkit (rev 2, after adversarial review)

Objective: turn the Vinted listing assistant into an all-in-one shop manager for pro and non-pro sellers by adding (0) backup + richer data model + navigation, (1) profit and stats, (2) a France pro toolkit. Data stays local in each browser; backup is a file the user exports and imports.

Mode: **direct** (git + GitHub remote exist, but no `gh` CLI): work on `main`, one commit per step, no branches or PRs. **All steps run serially in one working tree** (no parallel edits). Pushing to `origin/main` triggers a Cloudflare Pages deploy, so push only at the milestones marked **PUSH**.

Repo: `/Users/victorgrenaudier/Developer/vinted-assistant` (React 19 + Vite 8 + TypeScript 7, PWA, Cloudflare Pages Functions, Chrome MV3 extension in `extension/`; Node 24; vitest 5 supports Vite 8).

## Key design decisions (from the review)
- **No IndexedDB version bump.** The new fields are all optional and need no store or index, so the DB stays at **version 3**. A bump would risk `VersionError` in the extension bridge, a hang while another tab holds the old version, and an unrevertable downgrade. Legacy photo fields are removed by a one-time guarded pass instead.
- **Backup is an uncompressed ("stored") ZIP built from Blob parts**, with a small hand-written writer/reader (no fflate): photos are already JPEG, so compression gains nothing, and Blob parts are never copied into JS memory (an in-memory zip of a few hundred items could crash an iPhone tab).
- **Restore is atomic**: build all records first, then one readwrite transaction (`clear` + `put`s) over the three stores with no non-IndexedDB awaits inside; any failure aborts and leaves the data untouched.
- **Roll forward only**: never lower any version number in code.
- Pro numbers are information, not advice; every threshold carries a source and date.

## Project facts every step needs (cold-start brief)
- All user data is in browser IndexedDB `vinted-assistant`, version 3, stores `items` (key `id`), `model-poses` (key `id`), `sales` (key `itemId`). Defined in `src/db.ts` (`Item`, `Photo`, `Sale`, `ModelPose`, `listItems`, `getItem`, `saveItem` (stamps `updatedAt = Date.now()`), `deleteItem`, `newItem`, `listSales`, `saveSale`, `deleteSale`, `listPoses`, `savePose`, `deletePose`). `run()` opens a new connection per call and never closes it; there is no `onversionchange`/`onblocked` handling. Photos are `Blob`s inside `Item.photos[]` (`blob`, `fixed`, `improved`). Old records may still hold removed photo fields `cutout`, `colourShift`, `improvedBy` (a `cutout` blob may be PNG).
- `extension/bridge-content.js` also opens the DB, with hard-coded `DB_VERSION = 3`, and only runs on `https://*.pages.dev/*` (not on localhost). The unpacked extension must be reloaded in `chrome://extensions` after changes.
- `localStorage` keys: `app-token` (**a secret: never export it**), `price-drop-settings`, `reply-settings`, `inventory-filter`, `studio-backdrop`.
- `Screen` in `src/App.tsx` is a union of **objects** (`{ name: "home" }`, `{ name: "model"; back: Screen }`, `{ name: "item"; id }`, ...) held in `useState`; screens receive `go: (s: Screen) => void`. No router, no bottom nav. Settings' Save and Back both return home.
- "Mark as sold" is `sell()` in `ItemPage` (`src/Inventory.tsx`): sets `status: "sold"`, `soldAt`, `soldPrice`, then `saveSale({...})`; "Not sold after all" (`setStatus`) deletes the Sale. `euros` and `dateFr` are **unexported** constants in `Inventory.tsx` (~lines 23-24); `dateFr` omits the year and `euros` prints raw floats. Never import from `Inventory.tsx` in pure modules (it pulls in `App.tsx` and `gemini.ts`, which touches `window` at import time and breaks Node tests).
- `saveSale` is called only from `Inventory.tsx`. `src/batch.ts` writes items in the background (batch drafting queue).
- Styling: `src/styles.css`, `src/model.css` (already has press states, tabular-nums, `env(safe-area-inset-bottom)`, dark mode; `index.html` has `viewport-fit=cover`). Give each new screen its own CSS file (like `model.css`).
- UI language English; listing content French. No tests exist. Verification today: `npm run typecheck`, `npm run build` (`tsc -b && vite build`). `tsconfig.json` includes `src`, so test files are type-checked: import `describe/it/expect` explicitly from `"vitest"`.
- No `gh`, no Homebrew. `git push` works via the macOS Keychain helper. Never ask for or print a token.
- Hook note: a GateGuard hook may block the first Edit/Write/Bash on a file until you state the file's callers, data schema touched and the user's verbatim instruction in text; state them and retry.

## Invariants (check after EVERY step)
1. `npm run typecheck` and `npm run build` exit 0; `npm test` passes (from step 1).
2. Existing flows work: capture -> review -> studio -> handoff, price-drop list, mark live, mark sold, replies. Do not change an existing export's signature without updating all callers.
3. Existing v3 data survives: the app on a profile with existing items and sales lists the same ones.
4. `app-token` never appears in any export, log or commit.
5. Commit message ends with the attribution line from the session reminder.

## Order (strictly serial)
1 tests -> 2 backup -> 3 data model + connection hardening -> 4 cost/shipping capture (**PUSH**) -> 5 stats logic -> 6 bottom nav -> 7 Sales screen -> 8 Stats screen (**PUSH**) -> 9 thresholds research -> 10 business profile + pro logic -> 11 Pro screen + CSV -> 12 receipt (optional) -> 13 docs (**PUSH**).
Step 9 (web research writing one new file) may run in a background sub-agent at any time after step 1, provided it does not commit; the main agent reviews and commits it.

---

## Step 1: Test harness
Tasks: `npm i -D vitest`; script `"test": "vitest run"`; small `vitest.config.ts` (so the PWA plugin in `vite.config.ts` is not loaded); `src/pricing.test.ts` for `defaultFloor` (read it first; assert real behaviour with and without `price_min_eur`). Tests import from `"vitest"`; do NOT exclude tests from tsconfig.
Verify: `npm test`, typecheck, build. Exit: passing test; build output unchanged.
Rollback: revert the commit.

## Step 2: Backup export / import (strongest model: data-loss risk)
Context: no way to save or move data exists; this ships before any other data work.
Tasks:
- `src/zip.ts`: minimal ZIP "store" writer and reader. Writer: for each entry compute CRC32 by streaming `blob.stream()` one entry at a time, emit local header + the original Blob (no copy), then the central directory; return `new Blob([...parts], {type:"application/zip"})`. Reader: read the end-of-central-directory record and central directory from the file (`file.slice`), return entries whose data is `file.slice(start,end)`. ZIP64 not needed; reject archives that need it with a clear message. Unit tests in Node (Blob and `stream()` exist in Node 24): round trip, CRC, empty entry, many entries, UTF-8 names.
- `src/db.ts` (additive only): export `withDb` / a raw `putManyRaw(store, rows)` that does NOT stamp `updatedAt`, a `replaceAll({items, sales, poses})` doing `clear` + `put`s in ONE readwrite transaction over the three stores (abort on any error), and `normalizeItem(item)` = the existing `listed`->`live` fix + `stripLegacyPhotoFields` (extract it here so restore applies it; restored data never passes through `onupgradeneeded`).
- `src/backup.ts`: `buildBackup()` writes `manifest.json` (`{ app, schemaVersion: 3, exportedAt, items, sales, poses, settings }`) with each blob replaced by `{ path, type }` (real MIME type recorded per blob; unknown/legacy Blob fields are dropped, never serialised as `{}`), photo files under `photos/<itemId>/<photoId>/{blob,fixed,improved}`, poses under `poses/<id>`. `settings` copies only `price-drop-settings`, `reply-settings`, `studio-backdrop`, `inventory-filter` (and `business-profile` once it exists), never `app-token`. `parseBackup(file)` validates `manifest.app`, rejects a newer `schemaVersion`, validates shape (every photo has a blob entry, numeric prices) so a malformed file cannot write records that crash the UI. `restoreBackup(parsed, mode)`:
  - Merge: per item id keep the record with the newer `updatedAt` (raw put, preserving timestamps); sales: take the sale from whichever side's item won, else keep the existing one; poses: union by id; settings: keep current. Document in the UI that items deleted since the backup come back.
  - Replace: only after a confirmation that shows counts, an automatic safety export offered first, and a `navigator.storage.estimate()` check; applies backup settings; uses `replaceAll`.
  - Pause the batch queue (`src/batch.ts`) during restore, then `location.reload()`.
  - Pure parts (manifest build/validate, merge decision, normalisation) unit-tested with plain objects in `src/backup.test.ts`.
- Settings screen "Backup": **Export backup** (use `navigator.share({files})` when `canShare` allows, else an `<a download>` fallback; iOS standalone PWAs are unreliable with the anchor), **Import backup** (merge/replace), "Last backup: date", and call `navigator.storage.persist()` once.
- Reminder: save `last-backup-at` to `localStorage` after an export; on Home show a dismissible "Back up your data" banner if items exist and the last backup is over 30 days old or never; once per session.
Verify: unit tests; manual: export, check counts, `unzip -l` the file, confirm `app-token` is absent (search for the literal key name and the token value, not the word "token": `draftTokens` legitimately contains it); import Merge twice (no duplicates, timestamps preserved so the list order does not change); Replace into a cleared profile (photos incl. fixed/improved render); try a corrupted zip (clear error, data untouched). Manually test an export of 200+ synthetic photos on a real iPhone before relying on it.
Exit: lossless round trip for items, photo variants, sales, poses; restore atomic.
Rollback: revert; no schema change.

## Step 3: Data model, connection hardening, shared formatters (strongest model)
Depends: 2. No version bump.
Tasks:
- `src/db.ts`: `Item` gains `costPrice?: number` (EUR paid) and `sourcedAt?: number`. `Sale` gains `costPrice?`, `sourcedAt?`, `shippingCost?` (paid by seller), `otherFees?`, `paidAt?` (when the money reached the seller; defaults to `soldAt`). Shipping and fees live on the Sale only. Add `updatedAt?` is NOT added to Sale (merge rule above covers it).
- Replace per-call connections with one cached connection: `db.onversionchange = () => { db.close(); cached = undefined; location.reload(); }` and handle `onblocked` with a visible message "Close other tabs of the app". Keep behaviour of all exported functions.
- One-time legacy cleanup: `cleanLegacyFields()` runs once at app start behind `localStorage` flag `legacy-fields-cleaned`, walking items with a cursor and applying `stripLegacyPhotoFields` (unit-tested, pure).
- `extension/bridge-content.js`: `openDb()` becomes `indexedDB.open(DB_NAME)` (no version); if `onupgradeneeded` fires (the DB does not exist) call `req.transaction.abort()` and reject with a clear "open the app first" error so no empty v1 DB is left behind; remove `DB_VERSION`. Bump `extension/manifest.json` version.
- `src/format.ts`: `euros(n)` via `Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"})` (rounds to cents), `dateFr(ts)` with day, month and year, `monthKey(ts)` using `Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris"}).formatToParts`. Make `Inventory.tsx` import them (keep its visible output unchanged except year where useful) with tests in `src/format.test.ts`.
Verify: tests, typecheck, build. Manual: items and sales intact; open two tabs (no hang; second tab reloads); reload the extension in `chrome://extensions`, run a Gemini enhance job on the deployed `*.pages.dev` app (the bridge cannot be tested on localhost) after the step-4 push, or earlier by pushing only if the user agrees.
Exit: DB still v3, new fields available, bridge version-proof.
Rollback: revert; fields stay harmlessly in stored records.

## Step 4: Capture cost, shipping and fees  **PUSH after this step**
Depends: 3. Tasks:
- `src/sales.ts`: `saleFromItem(item, { soldPrice, shippingCost, otherFees, paidAt }, now): Sale`, `profitOf(sale)` = `round2(soldPrice - (costPrice ?? 0) - (shippingCost ?? 0) - (otherFees ?? 0))` with `costKnown: boolean`, and `marginPct`. Tests in `src/sales.test.ts` (missing cost flagged, float rounding such as 4.79 - 0.1).
- `ItemPage`: "Bought for" and "Date bought" available on any status; the mark-sold block gains optional "Shipping paid by you" and "Other fees"; `sell()` uses `saleFromItem`. "Not sold after all" deletes the Sale and leaves cost on the Item.
- Capture screen: one optional "Bought for" field next to Notes.
- Sold rows show profit when cost is known.
Verify: tests; manual: sell with cost and shipping (profit correct); sell without cost (no profit shown, no crash); un-sell and re-sell does not reuse stale shipping/fees.
Exit: fields persisted. Reload the unpacked extension. Then `git push origin main` (the user already uses push-to-deploy; confirm first if unsure).
Rollback: revert.

## Step 5: Stats logic, pure and tested
Depends: 4 (uses `profitOf`, new `Sale` fields). New `src/stats.ts` + `src/stats.test.ts` (import formatters/`monthKey` from `src/format.ts` only):
- `summarise(sales, items, range)`: revenue, known cost, shipping, fees, profit, margin %, sold count, average price, average days to sell, sell-through (sold in range / (sold in range + live now)).
- `monthly(sales, months)`: `{ month: "YYYY-MM", revenue, profit, count }[]`, bucketed with `monthKey` (Europe/Paris; no hand-made UTC offsets).
- `agingStock(items, now)`: live items by days since `listedAt` (0-30, 31-60, 61-90, 90+) with stock value at `listedPrice` and at known cost.
- `topBy(sales, "brand" | "category_path", n)`.
- `Range` helpers `thisMonth`, `last30`, `thisYear`, `allTime`.
Verify: tests with fixed `now`, month and year boundaries around the Paris DST changes, empty inputs, sales with missing cost.

## Step 6: Bottom navigation + route stubs
Depends: 5. Tasks:
- Add `{ name: "sales" } | { name: "stats" } | { name: "pro" }` to `Screen` in `src/App.tsx` and render placeholder `Sales`, `Stats`, `Pro` components in their own files.
- `src/BottomNav.tsx` (own CSS file): tabs Items, Sales, Stats, Settings; a Pro tab shown only when `readProfile().sellsAsBusiness` (a tiny `src/proFlag.ts` reading `localStorage` `business-profile` and a `window` event `va:profile-changed` that Settings dispatches so the nav updates immediately; until step 10 it always returns false). Visible only on top-level screens; hidden during capture, review, studio, model, handoff, item, replies.
- Rethink Settings now that it is a tab: Save stays on Settings (toast "Saved") instead of jumping home; remove the Back button when reached via the tab.
- Bottom padding to avoid overlap; respect `env(safe-area-inset-bottom)`.
Verify: typecheck, build; 390px viewport and desktop: tabs switch, nav hides inside flows, last list row not covered.

## Step 7: Sales screen
Depends: 4, 5, 6. Replace the `Sales` placeholder (`src/SalesScreen.tsx` + `src/sales.css`):
- Sales newest first: title, sold date, sold price, profit or "cost missing".
- Tap a row to edit cost, shipping, fees, sold price, paid date (writes `saveSale`; also updates the Item if it still exists, but cost only).
- Filter: this month, this year, all; footer totals via `summarise`.
Verify: three sales (one without cost): totals match hand computation.

## Step 8: Stats screen  **PUSH after this step**
Depends: 5, 6. Replace the `Stats` placeholder (`src/StatsScreen.tsx` + `src/stats.css`):
- Range chips; cards for revenue, profit, margin, sold count, days to sell, sell-through.
- Monthly bars (CSS or inline SVG, no chart library; one accent colour, labelled values, dark mode).
- Aging stock with the 90+ bucket highlighted, linking to the price-drop flow.
- Top brands/categories; honest empty states; a note when cost is missing on some sales so profit reads as partial.
Verify: same hand-computed data as step 7; 390px layout; dark mode.
Exit: useful to non-pro sellers with no pro setup. Push.

## Step 9: Verify French pro rules (strongest model; research; one data file; do not commit from a sub-agent)
Tasks: with WebSearch/WebFetch on official sources only (service-public.fr, impots.gouv.fr, urssaf.fr, autoentrepreneur.urssaf.fr, Vinted help centre), establish with date and URL: micro-entrepreneur turnover ceilings for sales of goods; VAT franchise thresholds (base and increased) for goods; DAC7 reporting thresholds (sales count and amount per year) and what Vinted sends; the line between occasional sale of personal used goods and a professional activity, and Vinted's rule that business sellers must use Vinted Pro; whether the micro-entrepreneur revenue ledger is **cash-basis** (date the money is received); the mandatory books for goods sellers (registre des achats, livre des recettes) and whether lot purchases must be itemised.
Write `src/proThresholds.ts` with `PRO_THRESHOLDS = { asOf, microGoodsCeiling, vatFranchiseBase, vatFranchiseIncreased, dac7Sales, dac7Amount, sources }`, each value commented with its source; `null` plus a reason where unverifiable; never guess. Report findings and uncertainty to the user.
Verify: every constant has a URL; `asOf` is today. Exit: sourced constants.

## Step 10: Business profile + pro logic
Depends: 8, 9. Tasks:
- `src/businessProfile.ts`: `localStorage` key `business-profile` = `{ sellsAsBusiness, legalName, siret, activity: "micro"|"company"|"other", vatRegime: "franchise"|"subject", address, receiptFooter }`; `readProfile`/`saveProfile` (dispatches `va:profile-changed`); SIRET check is a **warning, not a block** (La Poste establishments fail the standard Luhn rule); tests. Add `business-profile` to the backup settings list and to Replace restore (step 2 code).
- Settings: "I sell as a business" switch revealing the profile form and the Pro tab.
- `src/pro.ts` + `src/pro.test.ts` (pure): `yearTotals(sales, year)` by `paidAt ?? soldAt` (Europe/Paris), count and turnover; `thresholdProgress(totals, PRO_THRESHOLDS)` returning percent and status `below | near (>=80%) | over | unknown`; `registerRows(sales, items)`: receipts register (payment date, reference, description, amount, "Vinted") and purchases register built from **Sales (including those whose item was deleted)** plus unsold items with a cost; lot purchases cannot be split under the single-unit model (documented limitation).
Verify: tests incl. year boundaries, exactly-at-threshold, `null` thresholds -> `unknown`, deleted-item sales included.

## Step 11: Pro screen + CSV export
Depends: 6, 10. Replace the `Pro` placeholder (`src/ProScreen.tsx` + `src/pro.css`):
- Threshold cards with progress, status wording "below threshold / close / over" (never "not taxable"), the `asOf` date and source link, a warning when `asOf` is over 12 months old, and the fixed disclaimer "Information only, not tax advice; check with your accountant or the official site."
- Year selector; **Receipts register (CSV)** and **Purchases register (CSV)**: UTF-8 with BOM, `;` separator, comma decimals, ISO dates, French header row, proper quoting; CSV serializer unit-tested (quotes, semicolons, line breaks in titles).
Verify: open both files in Numbers/Excel (French locale): columns split, accents intact, amounts numeric.

## Step 12: Printable receipt (optional)
Depends: 11. A "Receipt" action on a sold item opens a print view (seller details from the profile, item, price, date, footer) and uses `window.print()` plus an `@media print` stylesheet. It is labelled **"Reçu / justificatif" and explicitly not an invoice** (a facture needs sequential numbering and mandatory mentions such as the VAT-exemption article; out of scope unless the user asks and the numbering counter is added to backups). Skip if not wanted.
Verify: print preview on desktop and iOS Safari: one clean page.

## Step 13: Docs and wrap-up  **PUSH after this step**
README: "Data, backup and stats" and "Pro tools (France)" sections, link to this plan, updated Layout list (`zip.ts`, `backup.ts`, `format.ts`, `sales.ts`, `stats.ts`, `pro.ts`, `businessProfile.ts`, `proThresholds.ts`, `BottomNav.tsx`, `SalesScreen.tsx`, `StatsScreen.tsx`, `ProScreen.tsx`) and the "stays on your phone" line (plus the backup file); `extension/README.md`: unversioned IndexedDB open. Run all invariants plus a clean-profile smoke test (create item, mark sold with cost, view Stats, export, clear site data, import, Gemini job).
Exit: documented, pushed, Cloudflare deploy green.

## Plan mutation protocol
Split a step if it outgrows one reviewable commit; insert new steps with the next free number and update the order; record skipped or abandoned steps under "Changes" with date and reason. Never lower a version number; never reorder 2 before 3.

## Anti-patterns to avoid
Storing or exporting `app-token`; thresholds without source and date; guessing tax rules; a charting library for a few bars; changing exported signatures without updating callers; importing `Inventory.tsx` from pure modules; clearing stores outside a single atomic transaction; building large archives in memory; pushing mid-milestone.

## Review log
- Rev 1 reviewed by a strongest-model sub-agent: 1 critical (in-memory zip + non-atomic Replace), 8 major (needless version bump, multi-tab upgrade hang, impossible rollback, double-cursor migration clobber, untestable bridge step, merge rules and timestamp stamping, false parallelism, unreusable formatters), ~15 minor. All incorporated above.

## Changes
- 2026-10-21, step 6: screens renamed `SalesScreen.tsx`, `StatsScreen.tsx`, `ProScreen.tsx`. On macOS (case-insensitive) `./Stats` resolved to `stats.ts` and broke tsc, same trap as `replies.ts`. Never name a component file the same as a logic file apart from case (`pro.ts` vs `Pro.tsx`, etc.).
- 2026-10-21, step 4: shipping/fees live on the Sale only, as planned; the Inventory list rows do not show profit (the item page and the Sales screen do).
