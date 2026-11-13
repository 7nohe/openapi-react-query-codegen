# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenAPI React Query Codegen generates React Query (TanStack Query) hooks from OpenAPI specifications. It first generates a TypeScript client (types, SDK and a small fetch/axios runtime) with its own generator in `src/client/`, then creates query/mutation hooks on top.

## Commands

```bash
# Build
npm run build

# Run tests with coverage
npm test

# Run a single test file
npx vitest tests/generate.test.ts

# Update snapshots
npm run snapshot

# Lint
npm run lint
npm run lint:fix

# Preview generated output in example apps
npm run preview:react
npm run preview:nextjs
npm run preview:tanstack-router
```

## Architecture

### Code Generation Pipeline

1. **CLI Entry** (`src/cli.mts`): Parses command-line options using Commander
2. **Generate** (`src/generate.mts`): Orchestrates the generation process:
   - Calls `generateClient()` (`src/client/index.mts`) to build the client in `openapi/requests/` and the normalized operations
   - Calls `createSource()` to generate React Query hooks in `openapi/queries/`
3. **Client Generator** (`src/client/`): `spec.mts` loads/bundles the document, `operations.mts` normalizes operations, `schema.mts` renders types, `emitTypes.mts` / `emitSdk.mts` write the files, and `runtime/*.runtime.ts` are the fetch/axios runtimes copied into the output
4. **Hook Generators** (`src/hooks/`): `generateFiles.mts` routes operations by HTTP method (GET → queries, suspense, infinite, prefetch, ensure; POST/PUT/PATCH/DELETE → mutations) to the `build*.mts` builders, which return statements as strings; `statement.mts` and `imports.mts` print them and the imports each file needs
5. **Write**: `writeGeneratedFiles()` (`src/client/index.mts`) writes both directories

### Generated Output Structure

The tool generates files in `openapi/queries/`:
- `common.ts`: Shared types, query keys, and key functions
- `queries.ts`: `useQuery` and `useMutation` hooks
- `suspense.ts`: `useSuspenseQuery` hooks
- `infiniteQueries.ts`: `useInfiniteQuery` hooks
- `prefetch.ts`: `prefetchQuery` functions
- `ensureQueryData.ts`: `ensureQueryData` functions
- `index.ts`: Re-exports

### Key Dependencies

- **typescript** (dev only): building this package and compiling generated output in tests
- **yaml**: parsing YAML specifications

## Testing

Tests use Vitest with snapshot testing. Test files in `tests/` correspond to source modules. `tests/utils.ts` has `generateTestClient()` to build the client for a spec in `tests/inputs/`; the runtimes are tested by importing `src/client/runtime/*.runtime.ts` directly against a local HTTP server.

Coverage thresholds: 95% lines/functions/statements, 90% branches.
