import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The app lives in app/ and imports the engine from ../src. Static build to dist/ for Vercel.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL("../dist", import.meta.url)), emptyOutDir: true, target: "es2022" },
  worker: { format: "es" },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
