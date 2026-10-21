// Runs in gemini.google.com's own JS world (manifest "world": "MAIN", at document_start) so it
// can see the page's fetch() calls, which an isolated-world content script cannot.
//
// Why: Gemini shows generated images as blob: URLs of a ~1024px preview. Its "Download
// full-sized image" button fetches the real image (about 1 MB) from lh3.googleusercontent.com.
// This hook hands those large image responses to gemini-content.js (isolated world) via
// window.postMessage, so the full-size image can be captured without reading any downloaded file.
(function () {
  "use strict";
  if (window.__vaGeminiMainHook) return;
  window.__vaGeminiMainHook = true;

  const MIN_BYTES = 150000;
  const origFetch = window.fetch;

  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const type = res.headers.get("content-type") || "";
      if (/^image\//i.test(type) && /googleusercontent\.com/i.test(res.url || "")) {
        res
          .clone()
          .blob()
          .then((blob) => {
            if (blob.size >= MIN_BYTES) window.postMessage({ source: "va-gemini-main", type: "image", blob }, location.origin);
          })
          .catch(() => {});
      }
    } catch {
      // Never let the hook break Gemini's own request.
    }
    return res;
  };
})();
