// Background service worker for the "Annonces → Vinted" extension.
//
// The content script (content.js) cannot fetch the handoff JSON itself: a fetch() made
// from a vinted.fr page is subject to vinted.fr's own CORS policy, which has nothing to do
// with the Cloudflare Pages site. A fetch() made from this background service worker, on the
// other hand, runs in the extension's own privileged context, and the `host_permissions`
// entry in manifest.json ("https://*.pages.dev/*") lets Chrome bypass CORS for it. This is
// the equivalent of the userscript's GM.xmlHttpRequest/GM_xmlhttpRequest call.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "FETCH_HANDOFF") return false;

  (async () => {
    let res;
    try {
      res = await fetch(message.url, { method: "GET" });
    } catch {
      sendResponse({ ok: false, error: "Could not reach the app. Check your connection." });
      return;
    }

    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      sendResponse({ ok: false, status: res.status, notJson: true });
      return;
    }

    sendResponse({ ok: res.status === 200, status: res.status, body });
  })();

  return true; // keep the message channel open for the async response above
});
