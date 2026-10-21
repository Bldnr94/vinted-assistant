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

// Gemini automation relay. The job itself lives in chrome.storage.local under "geminiJob";
// at most one job exists at a time. The bridge script (running on the *.pages.dev app tab)
// sends GEMINI_JOB_START when the user asks for a model photo; gemini-content.js (running on
// gemini.google.com) polls for it with GEMINI_JOB_POLL and reports back with GEMINI_JOB_RESULT.
// See the relay contract in gemini-content.js's header comment for the full shape.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !["GEMINI_JOB_START", "GEMINI_JOB_POLL", "GEMINI_JOB_RESULT"].includes(message.type)) return false;

  (async () => {
    if (message.type === "GEMINI_JOB_START") {
      const { geminiJob } = await chrome.storage.local.get("geminiJob");
      if (geminiJob && (geminiJob.status === "pending" || geminiJob.status === "running")) {
        sendResponse({ ok: false, error: "An automation is already running." });
        return;
      }
      // The bridge script sends the job nested under `job`, not flat on the message.
      const job = message.job || {};
      await chrome.storage.local.set({
        geminiJob: {
          status: "pending",
          itemId: job.itemId,
          garmentPhotoId: job.garmentPhotoId,
          poseId: job.poseId,
          prompt: job.prompt,
          garmentBase64: job.garmentBase64,
          poseBase64: job.poseBase64,
        },
      });
      const tabs = await chrome.tabs.query({ url: "https://gemini.google.com/*" });
      if (tabs.length) {
        await chrome.tabs.update(tabs[0].id, { active: true });
      } else {
        await chrome.tabs.create({ url: "https://gemini.google.com/app" });
      }
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "GEMINI_JOB_POLL") {
      const { geminiJob } = await chrome.storage.local.get("geminiJob");
      if (!geminiJob || geminiJob.status !== "pending") {
        sendResponse(null);
        return;
      }
      // Marking it "running" here, before handing the job back, is what stops a page reload
      // on gemini.google.com from re-processing the same job: a second poll sees "running",
      // not "pending", and gets null.
      const running = { ...geminiJob, status: "running" };
      await chrome.storage.local.set({ geminiJob: running });
      sendResponse(running);
      return;
    }

    // GEMINI_JOB_RESULT
    const { geminiJob } = await chrome.storage.local.get("geminiJob");
    const base = geminiJob || {};
    if (message.error) {
      await chrome.storage.local.set({ geminiJob: { ...base, status: "failed", error: message.error } });
    } else {
      await chrome.storage.local.set({ geminiJob: { ...base, status: "done", resultBase64: message.resultBase64 } });
    }
    sendResponse({ ok: true });
  })();

  return true; // keep the message channel open for the async response above
});
