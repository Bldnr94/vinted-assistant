# Annonces → Vinted (Chrome extension)

This is a Chrome MV3 unpacked extension version of the Tampermonkey/Userscripts script at
`../public/annonces-vinted.user.js`. It does exactly the same thing — it never needs a
userscript manager on a Mac running desktop Chrome.

On `https://www.vinted.fr/*`, when you're on the sell page (`/items/new...`), it shows a
small "Annonces" panel. Tapping "Fill the form" reads a handoff link from your clipboard,
downloads the listing JSON from your own Cloudflare Pages site, and fills in the sell
form's fields and photos at a human pace. It never presses publish — you always press the
real "Ajouter" button yourself.

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
