# What to run before finishing a task
- Run `pnpm lint` (Biome) to ensure style/lint compliance.
- Run `pnpm test` for Vitest with coverage (or `pnpm snapshot` if snapshots changed intentionally).
- Run `pnpm build` to confirm the generator compiles to dist.
- If touching example outputs, rerun the relevant `preview:*` command to verify generation still works.