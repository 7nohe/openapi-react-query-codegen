import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Globbed by tinyglobby relative to the project root, so this one is correctly
    // anchored and must stay relative. It is load-bearing at the repo root: without it
    // the agent worktrees under `.claude/worktrees/` are collected too (75 files
    // instead of 15). Note that a CLI `--exclude` appends to this list rather than
    // replacing it, so you cannot A/B this entry from the command line.
    exclude: [...defaultExclude, ".claude/**"],
    coverage: {
      // Scope coverage with `include`, not `exclude`. `coverage.exclude` is matched
      // against absolute paths with picomatch's `contains` option, so every relative
      // spelling of a `.claude/**` ignore (`./.claude/**`, `/.claude/**`, `**/.claude/**`)
      // also matches the project's own root when the repo is checked out under a
      // `.claude/` path — e.g. a git worktree in `.claude/worktrees/`. That excluded every
      // source file and silently passed the thresholds below against 0/0. `include` is
      // anchored to the project root, so it has no such failure mode.
      include: ["src/**"],
      exclude: ["src/cli.mts"],
      reporter: ["text", "json-summary", "json", "html"],
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
