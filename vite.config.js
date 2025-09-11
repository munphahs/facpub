import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],        // React plugin: JSX/TSX, Fast Refresh
  base: "/",                 // app served from root (good for local dev)
  server: { open: true }     // auto-open browser on npm run dev
});