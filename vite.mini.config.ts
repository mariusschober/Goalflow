import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: "telegram-mini-app",
  base: "/mini/",
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  build: {
    outDir: "../dist/mini",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "telegram-mini-app/index.html"),
    },
  },
  server: { port: 5174 },
});
