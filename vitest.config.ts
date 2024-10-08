import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["text", "json-summary", "json", "html"],
      exclude: ["src/cli.mts", "examples/**", "tests/**"],
      reportOnFailure: true,
      thresholds: {
        lines: 95,
        functions: 90,
        statements: 95,
        branches: 85,
      },
    },
  },
});
