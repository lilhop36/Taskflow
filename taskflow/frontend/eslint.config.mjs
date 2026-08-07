import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// NOTE: the pinned eslint@9.18 does not export the "eslint/config" helpers
// (defineConfig / globalIgnores), so we inline the flat-config equivalents.
const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  // Align with the backend's lint convention (backend/eslint.config.mjs):
  // `any` is allowed where the codebase intentionally trades strictness for
  // ergonomics (error payloads, API responses). Warnings stay on for the rest.
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default eslintConfig;
