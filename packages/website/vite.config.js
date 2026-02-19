import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Single page app: index.html is the entry point for all routes
    rollupOptions: {
      input: {
        main: "./index.html",
      },
    },
  },
  server: {
    port: 3000,
    open: false,
  },
});
