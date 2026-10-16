# Vinted Assistant

A personal, phone-first web app: photograph one of your own garments, get a French
vinted.fr listing drafted by Claude, review it, then hand it to the Vinted app and press
publish yourself.

- Photos and drafts stay on your phone (browser storage). Only the draft call sends photos,
  to Anthropic's API, through a small Cloudflare function that holds the API key.
- The app never talks to Vinted: no Vinted password, no Vinted API. The optional Annonces
  script fills vinted.fr's sell form in your own browser; you always press publish.
- Photos are only resized. Cleanup comes later and must never hide defects or change colours.

## How it works

1. **Photos**: a shot checklist (front, back, brand label, size tag, care label, defects,
   details), up to 20 photos.
2. **Draft**: up to 10 photos go to Claude (labels and defects first), which returns title,
   description, brand, category, size, colour, material, condition, defects, measurements to
   take and a rule-of-thumb price. Guessed fields are highlighted.
3. **Review**: edit everything. "Compare on vinted.fr" opens a search for similar items.
4. **Studio**: front, back and detail shots can go on a clean light-grey studio background
   with a soft shadow, cropped around the garment. The garment is cut out (Bria RMBG 2.0 on
   fal.ai, about 0.018 USD a photo) and copied pixel for pixel, so colours and defects stay as
   shot. Label and defect close-ups are never changed. If the cutout's colours differ from your
   photo, the app keeps the original unless you choose otherwise.
5. **List it**: either **Send to vinted.fr**, which fills vinted.fr's sell form for you (see
   "Fill on vinted.fr" below), or by hand: save the photos in listing order, open Vinted, copy
   the title and description, tap the listed values into the form. Either way you press
   publish in Vinted.

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

### 2b. fal.ai key (Studio photos)

1. Sign up at https://fal.ai, add credit (5 USD lasts about 250 photos), and create an API key.
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

### 5. Fill on vinted.fr (optional, about 15 minutes)

The Annonces userscript runs in your phone's browser on vinted.fr. When you tap **Fill the
form**, it adds your photos and types every field at a human pace, then stops. You check and
press publish. It never presses publish, never calls Vinted's API and never sees your Vinted
password.

**Account risk, plainly:** Vinted's terms forbid automated tools, and its page can tell typed
input from scripted input. Some cross-listing tool users got 24-hour suspensions in 2026.
Keeping it to your own items at a normal pace, and always publishing yourself, keeps the
risk low but not zero. If Vinted ever shows you a warning, stop using the script and use
the by-hand steps, which keep working.

**a. Cloudflare (once).**

1. **Workers & Pages → KV → Create a namespace**, name it `vinted-handoff`.
2. In your Pages project: **Settings → Bindings → Add → KV namespace**, variable name
   `HANDOFF`, namespace `vinted-handoff`. Redeploy (Deployments → latest → Retry).
3. If you set up Access in step 3: **Zero Trust → Access → Applications → Add →
   Self-hosted**, name `Handoff`, domain `vinted-assistant.pages.dev`, path `api/handoff/`,
   one policy with action **Bypass**, include **Everyone**. The script cannot sign in to
   Access. The path stays protected: sending needs your `APP_TOKEN`, and each listing link is
   a random code that expires after one hour.

**b. iPhone (Safari).**

1. Install **Userscripts** (free, by Justin Wasack) from the App Store. Open it once and tap
   **Set Userscripts Directory**, pick any folder (for example On My iPhone → Userscripts).
2. **Settings → Apps → Safari → Extensions → Userscripts**: turn it on, and under
   permissions allow **www.vinted.fr** and **vinted-assistant.pages.dev** (or All Websites).
3. In Safari open `https://vinted-assistant.pages.dev/annonces-vinted.user.js` (sign in to
   Access if asked). Tap the **aA** (or puzzle) icon in the address bar → **Userscripts** →
   **Tap to install** → **Install**.

**b. Android (Firefox; Chrome on Android has no extensions).**

1. Install **Firefox** from the Play Store. Menu → **Add-ons** → **Tampermonkey** → **Add**.
2. In Firefox open `https://vinted-assistant.pages.dev/annonces-vinted.user.js` and tap
   **Install** on Tampermonkey's page.
3. On the first fill, Tampermonkey asks whether the script may reach
   `vinted-assistant.pages.dev`: choose **Always allow domain**.

**c. Each listing.**

1. In the app, on **List it**, tap **Send to vinted.fr**, then **Copy link and open
   vinted.fr**. The link goes to your clipboard, not into Vinted's address.
2. Make sure you are in Safari (iPhone) or Firefox (Android), signed in to Vinted, on
   `www.vinted.fr/items/new`. If the Vinted app opens instead, open that address in the
   browser yourself. If the browser page only offers the app, use **aA → Request Desktop
   Website** (Safari) or menu → **Desktop site** (Firefox); the script works there too.
3. In the **Annonces** panel at the bottom, tap **Fill the form**, then **Paste** if the phone
   asks. Watch it fill (about 30 seconds). Rows with ✋ need you.
4. Check every field and the photo order, then press publish in Vinted.

**If a field stops filling:** Vinted changed its page. Tap **Form report** in the panel and
paste the copied text into the project thread; the field rules at the top of
`public/annonces-vinted.user.js` get fixed from it. After an update, open the script's
address again to reinstall it.

## Testing the MVP

List 3 real items end to end and note, for each:

- Time from first photo to pressing publish in Vinted (goal: under 3 minutes).
- Every brand, size and material in the draft matches the labels; nothing invented.
- Whether **Save photos** offers the Vinted app in the share sheet, or only Save Images.
- Whether **Open Vinted** opens the Vinted app or the website.
- With the script: which panel rows show ✋, and whether the photos arrive in order. Send the
  first **Form report** to the project thread so the field rules can be checked against the
  real form.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars   # then fill in the values
npm run preview                  # builds and serves app + /api/draft on http://localhost:8788
```

`npm run typecheck` checks the app and the function.

## Layout

- `src/`: the React PWA (screens in `App.tsx`, IndexedDB in `db.ts`, photo resize in `photos.ts`).
- `functions/api/draft.ts`: the Cloudflare Pages Function that calls Claude.
- `functions/api/handoff/`: stores one listing for an hour for the vinted.fr script.
- `public/annonces-vinted.user.js`: the vinted.fr form-filling userscript.
- `src/VintedSend.tsx`: the **Send to vinted.fr** step on the List it screen.
- `shared/listing.ts`: Vinted vocabulary (conditions, colours), shot list, draft schema.
  Correct the colour list or conditions here if vinted.fr's form differs.
