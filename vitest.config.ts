import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ['text', 'json-summary', 'json', 'html'],
      exclude: ['src/cli.mts', 'examples/**'],
      reportOnFailure: true,
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 85,
      }
    }
  },
});
