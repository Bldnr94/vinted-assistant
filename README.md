# Vinted Assistant

A personal, phone-first web app: photograph one of your own garments, get a French
vinted.fr listing drafted by Claude, review it, then hand it to the Vinted app and press
publish yourself.

- Photos and drafts stay on your phone (browser storage). Only the draft call sends photos,
  to Anthropic's API, through a small Cloudflare function that holds the API key.
- Nothing talks to Vinted. No Vinted password, no Vinted API, no automation of the Vinted app.
- Photos are only resized. Cleanup comes later and must never hide defects or change colours.

## How it works

1. **Photos**: a shot checklist (front, back, brand label, size tag, care label, defects,
   details), up to 20 photos.
2. **Draft**: up to 10 photos go to Claude (labels and defects first), which returns title,
   description, brand, category, size, colour, material, condition, defects, measurements to
   take and a rule-of-thumb price. Guessed fields are highlighted.
3. **Review**: edit everything. "Compare on vinted.fr" opens a search for similar items.
4. **Studio**: front, back and detail shots can go on a clean light-grey studio background
   with a soft shadow, cropped around the garment. The garment is cut out and copied pixel for
   pixel, so colours and defects stay as shot. By default the cutout runs on your phone, free
   (IS-Net through `@imgly/background-removal`; the 88 MB model downloads once, from this app,
   on first use). In Settings you can switch to Bria RMBG 2.0 on fal.ai, which gives cleaner
   edges for about 0.018 USD a photo. Label and defect close-ups are never changed. If the cutout's colours differ from your
   photo, the app keeps the original unless you choose otherwise.
5. **List it**: save the photos in listing order, open Vinted, copy the title and
   description, tap the listed values into the form, press publish in Vinted.

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

### 2b. fal.ai key (optional, Studio photos)

Only if you switch Studio cutout to fal.ai in Settings.

1. Sign up at https://fal.ai, add credit (the 10 USD minimum lasts about 550 photos), and create an API key.
2. In Cloudflare Pages, add it as the secret `FAL_KEY`, then redeploy.

### 3. Lock it to you (recommended)

**Zero Trust → Access → Applications → Add → Self-hosted**, domain
`vinted-assistant.pages.dev` (and `*.vinted-assistant.pages.dev` for preview builds),
policy **Allow**, include **Emails**: your email. You then sign in with a one-time code
sent to your email.

### 4. On your phone

1. Open the URL in Safari (iPhone) or Chrome (Android).
2. Install it: Share → **Add to Home Screen** (iPhone) or menu → **Install app** (Android).
3. Open it, tap **Settings**, paste your `APP_TOKEN`, save.

## Testing the MVP

List 3 real items end to end and note, for each:

- Time from first photo to pressing publish in Vinted (goal: under 3 minutes).
- Every brand, size and material in the draft matches the labels; nothing invented.
- Whether **Save photos** offers the Vinted app in the share sheet, or only Save Images.
- Whether **Open Vinted** opens the Vinted app or the website.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars   # then fill in the values
npm run preview                  # builds and serves app + /api/draft on http://localhost:8788
```

`npm run typecheck` checks the app and the function.

## Layout

- `src/`: the React PWA (screens in `App.tsx`, IndexedDB in `db.ts`, photo resize in `photos.ts`,
  garment cutout in `cutout.ts`).
- `scripts/cutout-assets.mjs`: runs after the build and copies the on-phone cutout model and
  runtime into `dist/cutout/`. The library and model data are AGPL-3.0, fine for this private app.
- `functions/api/draft.ts`: the Cloudflare Pages Function that calls Claude.
- `shared/listing.ts`: Vinted vocabulary (conditions, colours), shot list, draft schema.
  Correct the colour list or conditions here if vinted.fr's form differs.
