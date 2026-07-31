import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build and tooling output. Without these eslint walks the OpenNext bundle
    // (~1400 generated files, some of them megabytes of inlined worker code)
    // and dies with "JavaScript heap out of memory" before it reaches src --
    // which silently costs the project its only automated check.
    ".open-next/**",
    ".wrangler/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
