import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `--mode web` builds the static web version (data in the browser, no server) into dist-web/, `--mode android`
// the same for the Play app (Capacitor, dist-android/) — relative paths, so both work from any folder.
const ON_DEVICE: Record<string, string> = { web: "dist-web", android: "dist-android" };

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: ON_DEVICE[mode] ? "./" : "/",
  build: { outDir: ON_DEVICE[mode] || "dist" },
  server: {
    port: 5173,
    watch: { ignored: ["**/release/**", "**/dist/**", "**/dist-web/**", "**/dist-android/**", "**/build/**", "**/android/**"] },
    proxy:
      ON_DEVICE[mode]
        ? undefined
        : {
            "/api": {
              target: "http://127.0.0.1:8787",
              timeout: 180000,
            },
          },
  },
}));
