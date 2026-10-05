import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/healthz": "http://127.0.0.1:3000",
      "/auth": "http://127.0.0.1:3000",
      "/api": "http://127.0.0.1:3000",
    },
  },
});
