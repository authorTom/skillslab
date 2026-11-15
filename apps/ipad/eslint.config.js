// The iPad app's own lint config. It is a separate package from the Next.js
// web app at the repo root, which ignores apps/**.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Node's globals, for the build scripts (no extra package needed for these). */
const nodeGlobals = {
  process: "readonly",
  Buffer: "readonly",
  console: "readonly",
  URL: "readonly",
};

export default tseslint.config(
  {
    ignores: ["dist/**", "ios/**", "native/**", "node_modules/**", "build/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // `_name` marks a deliberately unused binding.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs", "branding/**/*.mjs", "*.config.js"],
    languageOptions: { globals: nodeGlobals },
  }
);
