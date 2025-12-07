# Repository Guidelines

## Project Structure & Module Organization
- Source code lives in `src/` (CLI entry `cli.mts`, generator pipeline `generate.mts`, codegen helpers like `createSource.mts`, `createImports.mts`, `createExports.mts`, `service.mts`, formatting in `format.mts`).
- Tests reside in `tests/` (Vitest).
- Example apps under `examples/` (React/Next.js/TanStack Router) consume the generated client.
- Docs site in `docs/` (Astro). Build artifacts output to `dist/`.

## Build, Test, and Development Commands
- Install: `pnpm install`
- Build generator: `pnpm build` (cleans `dist/`, runs `tsc`).
- Lint/format check: `pnpm lint` (Biome). Auto-fix: `pnpm lint:fix`.
- Tests: `pnpm test` (Vitest with coverage). Snapshots: `pnpm snapshot`.
- Preview generation into examples: `pnpm preview:react`, `pnpm preview:nextjs`, `pnpm preview:tanstack-router`.

## Coding Style & Naming Conventions
- Language: TypeScript (strict, ESNext, NodeNext). Keep code in modules (`.mts`), output compiled to `dist/`.
- Formatting/linting via Biome: 2-space indent, double quotes, trailing commas, organized imports. Run formatters before committing.
- Generated outputs include a header comment with package version; preserve this when modifying generation.
- Prefer descriptive function names and explicit types; avoid implicit `any`.

## Testing Guidelines
- Framework: Vitest. Coverage enabled by default.
- Place tests in `tests/`; mirror generator behavior with snapshot tests where helpful.
- After generator changes, run tests and consider regenerating example outputs to manually diff.

## Commit & Pull Request Guidelines
- Commits: clear, descriptive messages (e.g., `fix: align imports for generated queries`, `chore: update ts-morph config`). Avoid bundling unrelated changes.
- Pull requests: include summary of changes, affected areas (e.g., codegen output, docs, examples), and test commands run. Link issues when applicable. Add before/after notes or sample generated snippets if behavior changes.

## Agent-Specific Notes
- Use AST-aware paths (ts-morph/TypeScript factory) when editing generators to keep output structurally valid.
- Respect ignore patterns in `biome.json` and avoid checking in `dist/` or example-generated artifacts unless explicitly intended.
