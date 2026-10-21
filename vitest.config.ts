import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests do not load the PWA plugin.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
