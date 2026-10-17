import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Vinted Assistant",
        short_name: "Annonces",
        description: "Photos to a reviewed French Vinted listing",
        lang: "fr",
        theme_color: "#0b7a75",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//, /\.user\.js$/],
        // The cutout runtime and model load from /cutout/ on first use, not at install.
        globPatterns: ["**/*.{js,css,html,svg,png,jpg}"],
      },
    }),
  ],
});
