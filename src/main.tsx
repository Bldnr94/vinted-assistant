import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// After a deploy, the open app still runs the version its service worker cached: the new worker
// installs in the background and takes over a few seconds after launch (skipWaiting +
// clientsClaim). Reload when that happens soon after launch, so one opening is enough to get the
// new version. Later than that, the switch waits for the next launch rather than interrupting you.
const launchedAt = Date.now();
if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (Date.now() - launchedAt < 20_000) location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
