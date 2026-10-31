# Annonces (Chrome extension, Gemini helper)

This unpacked Chrome extension runs the app's Gemini jobs (below). It **does not run on
vinted.fr**. Until 1.0.8 it also had a vinted.fr form-filling script; that was removed in 1.1.0
because Vinted's terms ban scripts on its site and the account was restricted for 24 hours on
2026-10-31 for "automated activity". Fill Vinted by hand from the app's **List it** screen.

## Gemini automation (optional, experimental)

The app's "Photos" screen has "Do everything with Gemini" and per-section buttons. With this
extension loaded, each job opens (or reloads) a `gemini.google.com` tab, uploads the photo(s),
types the prompt, waits for Gemini's generated image, and feeds it back into the app: either
a new background for one of your photos ("enhance": one photo in, the result stored on that
photo as `improved`, unticked until you approve it) or a model photo ("tryon": your model
photo plus the garment, added as an unapproved AI photo). Both start from the photo as shot,
so the garment is never redrawn twice. Jobs run one after the other; no manual
share/copy/import needed.

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

Only one job runs at a time. A job that was cut off (Gemini tab closed, Chrome quit or
restarted mid-run, tab never loaded) no longer blocks the next one: the extension notices
the Gemini tab that took it is gone, or that nobody picked it up within a minute, and just
starts the new job. A job still running in an open Gemini tab blocks for at most 5 minutes;
close that tab to free it immediately. If an old copy of the extension is stuck anyway,
removing it and loading it again in `chrome://extensions` clears its stored job.

`bridge-content.js` opens the app's IndexedDB **without a version number**, so it always gets whatever
version the app has migrated to, and a future schema bump cannot break it. If the database does not exist
yet (the app never ran on this origin) it aborts with "Open the app once" instead of creating an empty one.

If it stops working after a Gemini redesign, use the manual steps underneath the button —
they're unaffected.

## Loading it

1. Open `chrome://extensions` in Chrome.
2. Turn on "Developer mode" (top right).
3. Click "Load unpacked" and select this `extension/` folder.
4. Open the app and the Gemini buttons on the Photos screen become active.

## Updating

This is an unpacked extension, so it does not auto-update. To pick up a new version:

1. `git pull` in this repo.
2. Go to `chrome://extensions` and click the reload icon (circular arrow) on this
   extension's card.

## Custom domain caveat

`manifest.json` lists the app's sites as `https://*.pages.dev/*` (where the bridge script runs).
If your Cloudflare Pages site is served from a **custom domain**, add that origin (e.g.
`"https://annonces.example.com/*"`) to `host_permissions` and to the bridge script's `matches`
in `manifest.json`, then reload the extension in `chrome://extensions`.
