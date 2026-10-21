# Annonces → Vinted (Chrome extension)

This is a Chrome MV3 unpacked extension version of the Tampermonkey/Userscripts script at
`../public/annonces-vinted.user.js`. It does exactly the same thing — it never needs a
userscript manager on a Mac running desktop Chrome.

On `https://www.vinted.fr/*`, when you're on the sell page (`/items/new...`), it shows a
small "Annonces" panel. Tapping "Fill the form" reads a handoff link from your clipboard,
downloads the listing JSON from your own Cloudflare Pages site, and fills in the sell
form's fields and photos at a human pace. It never presses publish — you always press the
real "Ajouter" button yourself.

## Gemini automation (optional, experimental)

The app's "On model" screen has an "Automate with Gemini (Mac, this browser)" button next to
the manual Gemini steps. With this extension loaded, it opens (or focuses) a
`gemini.google.com` tab, uploads the garment + pose photos, types the prompt, waits for
Gemini's generated image, and feeds it back into the app as a new AI photo — no manual
share/copy/import needed.

The same machinery also powers "Improve with Gemini" on the Background screen: it sends one
photo (no model pose) with a prompt that replaces only the background, and the bridge script
stores Gemini's result on that photo (`improved`, flagged `improvedBy: "gemini"`, unticked
until you approve it).

What it does on Gemini, in order: reloads Gemini onto a fresh chat, switches on the "Create
image" tool (without it Gemini refuses), attaches the model photo then the garment photo
(the prompt calls them image 1 and image 2), types the prompt, sends, waits for the generated
image, then clicks Gemini's own "Download full-sized image" button to capture the full-size
file (falls back to the on-screen preview if that fails). A side effect: Gemini's download
button also saves a copy of the image in your Downloads folder; the app uses the captured
copy, so you can delete those files.

The selectors were checked against the live Gemini page in October 2026, but Gemini is an
Angular app whose markup changes without notice. If a step can't find its element, the
automation stops with a clear error shown in the panel on the Gemini tab and in the app, and
the existing manual "Send model + garment to Gemini" / "Import Gemini result" steps keep
working exactly as before, with no dependency on this feature. The panel's last line tells
you which step failed.

Files that work together:
- `bridge-content.js` — runs on your Cloudflare Pages app's own domain, reads the garment and
  pose photos straight out of the app's IndexedDB, and writes the finished AI photo back into
  it once Gemini is done.
- `gemini-content.js` — runs on `gemini.google.com`, drives its chat UI, and captures the
  result image.
- `gemini-main.js` — runs in Gemini's own page context so it can see the page's network
  requests; it forwards the full-size image Gemini fetches for the download button.
- `background.js` — relays the job between the tabs via `chrome.storage.local` (no server
  round-trip; nothing about this leaves your own browser).

After pulling an update, reload the extension in `chrome://extensions` and reload the app's
tab, since content scripts are injected when a page loads.

If it stops working after a Gemini redesign, use the manual steps underneath the button —
they're unaffected.

## Loading it

1. Open `chrome://extensions` in Chrome.
2. Turn on "Developer mode" (top right).
3. Click "Load unpacked" and select this `extension/` folder.
4. Open vinted.fr's sell page — the "Annonces" panel should appear at the bottom of the screen.

## Updating

This is an unpacked extension, so it does not auto-update. To pick up a new version:

1. `git pull` in this repo.
2. Go to `chrome://extensions` and click the reload icon (circular arrow) on this
   extension's card.

## Custom domain caveat

`manifest.json` grants `host_permissions` for `https://*.pages.dev/*` only. This lets the
background service worker fetch the handoff JSON from your Cloudflare Pages site without
being blocked by CORS (a privilege only the extension's own background/service-worker
context gets — a fetch from the content script injected into vinted.fr would still be
subject to vinted.fr's CORS policy, regardless of permissions).

If your Cloudflare Pages site is served from a **custom domain** instead of the default
`*.pages.dev` subdomain, add that origin (e.g. `"https://annonces.example.com/*"`) to the
`host_permissions` array in `manifest.json`, then reload the extension in
`chrome://extensions` for the change to take effect.
