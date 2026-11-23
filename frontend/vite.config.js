import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // job-service (đứng trước "/api" để không bị đẩy nhầm sang user-cv)
      "/api/v1": "http://localhost:8082",
      "/api": "http://localhost:8081",
    },
  },
});
