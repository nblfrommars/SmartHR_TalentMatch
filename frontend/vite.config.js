import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // REST: mọi API đi qua api-gateway
      "/api": "http://localhost:8080",
      // WebSocket thông báo realtime: api-gateway -> notification-service
      "/ws": { target: "ws://localhost:8080", ws: true },
    },
  },
});
