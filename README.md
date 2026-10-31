# Vinted Assistant

A personal, phone-first web app: photograph one of your own garments, get a French
vinted.fr listing drafted by Claude, review it, then hand it to the Vinted app and press
publish yourself.

- Photos and drafts stay on your phone (browser storage), plus a backup file you make yourself in
  Settings. Only the draft call sends photos, to Anthropic's API, through a small Cloudflare function
  that holds the API key.
- Nothing touches Vinted: no Vinted password, no Vinted API, no script on Vinted's pages. You
  fill the sell form yourself from the app's copy buttons and press publish.
- Real photos are only resized and gently auto-fixed on the phone. Anything Gemini makes (optional) starts
  unticked and must be checked against the real photo before it goes on a listing.

## How it works

1. **Photos**: a shot checklist (front, back, brand label, size tag, care label, defects,
   details), up to 20 photos. Front, back and detail shots get a free automatic fix on the
   phone: whites brought up to white and dim photos brightened (each capped), and the colour
   cast of indoor light removed using only grey or white areas. The fix is one curve for the
   whole photo, so nothing is redrawn and defects stay visible. Labels and defect close-ups
   stay as shot, and a tap on "Auto-fixed ✓" goes back to the original.
2. **Draft**: up to 10 photos go to Claude (labels and defects first), which returns title,
   description, brand, category, size, colour, material, condition, defects, measurements to
   take and a rule-of-thumb price. Guessed fields are highlighted.
3. **Review**: edit everything. "Compare on vinted.fr" opens a search for similar items.
4. **Photos (Gemini, Mac)**: one optional step. With the Chrome extension loaded, Gemini (free on your
   Google plan, no API key) does two things, one photo at a time, in a Gemini tab that opens by itself:
   - **Background**: front, back and detail photos get a clean background (wood floor, white sheet, light
     wall or plain studio) with the garment kept.
   - **On model**: the garment goes on your own model photo(s), added once in Settings → My model (one to
     three photos of yourself or a model, no image-generation service involved).

   "Do everything with Gemini" queues both. Gemini redraws the whole photo, so every result starts
   unticked: compare colour, print, logo and defects with your real photo, then tick "Use Gemini version" or
   "Add to listing". Model photos start from the as-shot (or auto-fixed) garment photo, never from an
   improved one, so the garment is not redrawn twice. Ticked model photos go after every real photo, and the
   description gets a line saying they are AI-generated illustrations. Labels and defect close-ups are never
   sent. On a phone, where the extension cannot run, "On a phone: do it by hand in the Gemini app" copies the
   prompt and shares the model photo and the garment to the Gemini app; you import the result back.
5. **List it**: save the photos in listing order, open Vinted, then go down the field rows,
   tapping each to copy it and pasting or picking it in Vinted's form (see step 5 below). You
   press publish in Vinted.

## Setup (about 30 minutes, once)

You need: a GitHub account (this repo), an Anthropic API account, a free Cloudflare account.

### 1. Anthropic API key

1. Go to https://console.anthropic.com, add a payment method, and create an API key.
2. Under Limits, set a monthly spend limit (10 USD is plenty: a draft costs about 0.10 USD).

### 2. Cloudflare Pages

1. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, pick
   `Bldnr94/vinted-assistant`.
2. Build settings: framework preset **None**, build command `npm run build`, output
   directory `dist`.
3. **Settings → Variables and Secrets**, add for Production, both as **Secret**:
   - `ANTHROPIC_API_KEY`: your key from step 1.
   - `APP_TOKEN`: a long random string you make up (for example from a password manager).
     The app sends it with every draft so nobody else can spend your API credit.
   - Optional `MODEL`: `claude-sonnet-5-5` to halve the cost; default is `claude-opus-5-5`.
4. Deploy. You get a URL like `https://vinted-assistant.pages.dev`.

### 3. Lock it to you (recommended)

**Zero Trust → Access → Applications → Add → Self-hosted**, domain
`vinted-assistant.pages.dev` (and `*.vinted-assistant.pages.dev` for preview builds),
policy **Allow**, include **Emails**: your email. You then sign in with a one-time code
sent to your email.

### 4. On your phone

1. Open the URL in Safari (iPhone) or Chrome (Android).
2. Install it: Share → **Add to Home Screen** (iPhone) or menu → **Install app** (Android).
3. Open it, tap **Settings**, paste your `APP_TOKEN`, save.

### 5. Listing on Vinted (by hand, about a minute)

The **List it** screen gives you, in the order of Vinted's sell form:

1. **Save photos**: shares them to your gallery, or downloads them numbered in listing order.
2. **Open Vinted**: the sell screen, in the Vinted app if it is installed. Add the photos front first.
3. A row per field (titre, description, catégorie, marque, taille, état, couleur, matière, prix).
   Tap a row to copy it (title, description, category search word, brand, price) and get a tick;
   the others show the exact Vinted wording to pick.
4. Check everything, press publish in Vinted, then **Mark live** in the app.

**Why no form-filling script:** an earlier version had a userscript (and a Chrome extension
port) that filled vinted.fr's form. Vinted's terms ban scripts, third-party tools and external
software on its site, and on 2026-10-31 it restricted the account for 24 hours for "automated
activity". A repeat can mean a permanent ban, so the script is retired: the copy at
`public/annonces-vinted.user.js` is now an empty 2.0.0 that runs on no page, so an installed
copy that auto-updates goes quiet. Delete it from Tampermonkey anyway. Don't bring it back in a
"harder to detect" form.

### 5b. On a Mac, in desktop Chrome (optional)

The app itself (the PWA at steps 1–4) needs no changes to run in a desktop browser: open the
same Cloudflare Pages URL in Chrome or Safari on the Mac, sign in through Access if you set
it up, and use the file picker instead of the phone's camera when adding photos.

## Testing the MVP

List 3 real items end to end and note, for each:

- Time from first photo to pressing publish in Vinted (goal: under 3 minutes).
- Every brand, size and material in the draft matches the labels; nothing invented.
- Whether **Save photos** offers the Vinted app in the share sheet, or only Save Images.
- Whether **Open Vinted** opens the Vinted app or the website.
- With the script: which panel rows show ✋, and whether the photos arrive in order. Send the
  first **Form report** to the project thread so the field rules can be checked against the
  real form.

## Inventory and price drops

The home screen lists every item as **Draft**, **Live** or **Sold**. Nothing reads Vinted: you
mark each change yourself.

- After you press publish on Vinted, tap **Published on Vinted: mark live** on the List it screen.
  The item goes live at the drafted price, with a floor (the low end of the drafted range, or 70%
  of the price) that you can change on the item.
- When a live item has kept the same price for 14 days, it shows under **Needs a price drop** with
  a suggested price about 12% lower, never below its floor. Lower it on Vinted, then tap
  **I lowered it**; **Not yet** hides it for 7 days. The days and percentage are in Settings.
- **Mark as sold** records the sale price. Sales are kept even if you delete the item, so they can
  feed price suggestions later.

## Sales, profit and stats

The bottom bar has **Items**, **Sales**, **Stats**, **Settings** (and **Pro** for business sellers).

- **What you paid.** Enter "Bought for" (and optionally the date) when you photograph an item or later on
  its page. When you mark an item sold you can add the shipping you paid and any other fees; the profit is
  shown on the item.
- **Sales** lists every sale, newest first, with its profit. Tap one to complete it afterwards: cost,
  shipping, fees, the date it sold and the date the money reached you. A sale without a cost says "before
  cost" and the totals say the profit is partial until you add it.
- **Stats** shows revenue, profit, margin (over the sales that have a cost), average time to sell,
  sell-through, the last six months, live items by age (the 90+ days bucket is highlighted) and your top
  brands and categories. Days and months follow Paris time.

## Backup

Everything lives in the browser's storage, so clearing site data or a storage clean-up would erase it.
**Settings → Backup** exports one `.zip` (items, every photo version, sales, model photos and your settings;
**never the app token**) and imports it back. **Merge** adds what is missing and keeps the newer version of
each item (items deleted since the backup come back); **Replace** erases the device first, saves a safety
copy of your current data before doing so, and either completes fully or changes nothing. Home reminds you
once a month. A backup is stored uncompressed, so a large shop makes a large file; on a phone it opens the
share sheet (Files, iCloud, a message).

## Pro tools (France)

For people who sell as a business (Settings → "I sell as a business" shows the **Pro** tab and the business
details: name, SIRET, status, VAT regime, address, receipt footer).

- **Thresholds.** Turnover (counted by the day the money reached you) against the micro-entrepreneur
  ceiling for goods, the VAT franchise thresholds and Vinted's DAC7 reporting thresholds, each with its
  official source and the date it was checked. They are in `src/proThresholds.ts`; update them there when
  they change. The screen warns when they are more than a year old.
- **Registers as CSV** (French spreadsheet format): the receipts register by payment date and the purchases
  register from the costs you entered (including the cost of sold items whose listing you deleted).
- This is information, not tax advice. Not covered because no official source was found: the exact line
  between selling your own belongings and a professional activity, and how a lot bought in one go must be
  itemised.

The construction plan these features were built from is in `plans/vinted-manager-foundation-stats-pro.md`.

## Tests

`npm test` runs the unit tests (vitest) for the pure logic: backup file format and merge, stats, profit,
pro thresholds, CSV, the SIRET check and formatting.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars   # then fill in the values
npm run preview                  # builds and serves app + /api/draft on http://localhost:8788
```

`npm run typecheck` checks the app and the function.

## Layout

- `src/`: the React PWA (screens in `App.tsx`, IndexedDB in `db.ts`, photo resize and auto-fix in
  `photos.ts`).
- `functions/api/draft.ts`: the Cloudflare Pages Function that calls Claude.
- `public/annonces-vinted.user.js`: retired, empty stub of the old vinted.fr script (see step 5).
- `src/Studio.tsx`: the Photos step (Gemini backgrounds, on-model photos, approval).
- `src/ModelSetup.tsx`: add your own model photo(s).
- `src/gemini.ts` + `src/geminiPrompts.ts`: bridge to the Chrome extension in `extension/` and the prompts
  Gemini receives.
- `shared/listing.ts`: Vinted vocabulary (conditions, colours), shot list, draft schema.
  Correct the colour list or conditions here if vinted.fr's form differs.
- `src/db.ts`: the IndexedDB stores (items, sales, model photos), one shared connection.
- `src/zip.ts` + `src/backup.ts` + `src/BackupSection.tsx` + `src/download.ts`: the backup file, its merge and
  restore rules, and the Settings and Home UI.
- `src/format.ts`: euros and Paris-time dates, shared by the screens and the pure modules.
- `src/sales.ts` + `src/stats.ts`: profit per sale and the figures behind Sales and Stats
  (`SalesScreen.tsx`, `StatsScreen.tsx`). Screens are named `*Screen.tsx` so `./Stats` cannot resolve to
  `stats.ts` on a case-insensitive filesystem.
- `src/BottomNav.tsx` + `src/proFlag.ts`: the tab bar and the "Pro tab" switch.
- `src/businessProfile.ts` + `src/BusinessSection.tsx`: business details and the SIRET check.
- `src/pro.ts` + `src/proThresholds.ts` + `src/csv.ts` + `src/ProScreen.tsx`: thresholds (with sources), the
  two registers and their CSV export, and the Pro tab.
