import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    // apps/ipad is a separate package with its own vite.config.ts, deps and
    // test setup; it runs its own suite via `npm test` in that directory.
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
