import { fileURLToPath } from "node:url";
import { defaultExclude, defineConfig } from "vitest/config";

// `coverage.exclude` patterns are matched against absolute paths with picomatch's
// `contains` option, so a bare `.claude/**` matches any path that merely contains a
// `.claude` segment. That silently excludes every source file when the project itself
// is checked out under a `.claude/` path (e.g. a git worktree in `.claude/worktrees/`),
// which makes the coverage thresholds below pass against 0/0. Anchor it to this
// project's own root instead. `new URL(".", ...)` keeps the trailing separator, and the
// backslashes must be normalized because vitest slashes the file path but not the pattern.
const projectRoot = fileURLToPath(new URL(".", import.meta.url)).replace(
  /\\/g,
  "/",
);

export default defineConfig({
  test: {
    // `test.exclude` is globbed by tinyglobby relative to the project root, so this one
    // is already anchored and must stay relative.
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
        `${projectRoot}.claude/**`,
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
