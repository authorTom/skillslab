import { defineConfig, loadEnv, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import pkg from "./package.json";
import { releaseDefaultProblems } from "./scripts/release-defaults.mjs";

const config: UserConfig = {
  plugins: [react()],
  define: {
    // Shown as the app version when running in a browser during development;
    // on a device the version comes from the app bundle.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
};

// A production build (npm run build, and so every archive) checks the defaults
// it bakes in; see scripts/release-defaults.mjs.
export default defineConfig(({ command, mode }) => {
  if (command === "build" && mode === "production") {
    const problems = releaseDefaultProblems({ ...loadEnv(mode, __dirname, ""), ...process.env });
    if (problems.length > 0) {
      throw new Error(`Can't make a release build:\n- ${problems.join("\n- ")}`);
    }
  }
  return config;
});
