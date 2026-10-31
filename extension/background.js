// Background service worker for the Annonces extension. Since 1.1.0 it has no vinted.fr
// script: Vinted's terms ban scripts on its site (account restricted 2026-10-31).
//
// Gemini automation relay. The job itself lives in chrome.storage.local under "geminiJob";
// at most one job exists at a time. The bridge script (running on the *.pages.dev app tab)
// sends GEMINI_JOB_START when the user asks for a model photo; gemini-content.js (running on
// gemini.google.com) polls for it with GEMINI_JOB_POLL and reports back with GEMINI_JOB_RESULT.
// See the relay contract in gemini-content.js's header comment for the full shape.
// Whether an unfinished job still has something working on it. A job is dead, and must not block
// the next one, when:
// - it is older than 5 minutes (Gemini answers in about a minute);
// - it is "pending" for over a minute: the Gemini tab polls as soon as it loads, so nobody
//   picked it up (tab closed or never loaded);
// - it is "running" but the Gemini tab that took it is gone or has left gemini.google.com
//   (tab closed, Chrome quit mid-run). chrome.storage.local survives a restart, so without
//   this check a job cut off that way blocked every new one until the 5 minutes ran out.
async function jobIsAlive(job) {
  if (!job || (job.status !== "pending" && job.status !== "running")) return false;
  const age = Date.now() - (job.createdAt || 0);
  if (!job.createdAt || age > 5 * 60 * 1000) return false;
  if (job.status === "pending") return age < 60 * 1000;
  if (typeof job.tabId !== "number") return true; // taken by an older version of this script
  try {
    const tab = await chrome.tabs.get(job.tabId);
    return /^https:\/\/gemini\.google\.com\//.test(tab.url || tab.pendingUrl || "");
  } catch {
    return false; // tab no longer exists
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !["GEMINI_JOB_START", "GEMINI_JOB_POLL", "GEMINI_JOB_RESULT"].includes(message.type)) return false;

  (async () => {
    if (message.type === "GEMINI_JOB_START") {
      const { geminiJob } = await chrome.storage.local.get("geminiJob");
      // A dead job (see jobIsAlive) is simply replaced.
      if (await jobIsAlive(geminiJob)) {
        sendResponse({
          ok: false,
          error: "Gemini is still working on another photo in the Gemini tab. Wait for it to finish, or close the Gemini tab and try again.",
        });
        return;
      }
      // The bridge script sends the job nested under `job`, not flat on the message.
      const job = message.job || {};
      await chrome.storage.local.set({
        geminiJob: {
          status: "pending",
          createdAt: Date.now(),
          mode: job.mode === "enhance" ? "enhance" : "tryon",
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
        // Reload it onto a fresh chat: gemini-content.js only looks for a job when the page
        // loads, so merely focusing an already-open Gemini tab would never start the job.
        await chrome.tabs.update(tabs[0].id, { url: "https://gemini.google.com/app", active: true });
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
      // tabId lets jobIsAlive see later whether that Gemini tab is still there.
      const running = { ...geminiJob, status: "running", tabId: sender.tab && sender.tab.id };
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
