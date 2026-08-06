import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...defaultExclude, ".claude/**"],
    coverage: {
      reporter: ["text", "json-summary", "json", "html"],
      exclude: [
        "src/cli.mts",
        "examples/**",
        "tests/**",
        "docs/**",
        "dist/**",
        "vitest.config.ts",
        ".claude/**",
      ],
      reportOnFailure: true,
      thresholds: {
        lines: 95,
        functions: 95,
        statements: 95,
        branches: 90,
      },
    },
  },
});
