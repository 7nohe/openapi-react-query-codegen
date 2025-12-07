# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenAPI React Query Codegen generates React Query (TanStack Query) hooks from OpenAPI specifications. It uses `@hey-api/openapi-ts` to generate TypeScript clients and then creates additional query/mutation hooks on top.

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
   - Calls `@hey-api/openapi-ts` to generate base TypeScript client in `openapi/requests/`
   - Calls `createSource()` to generate React Query hooks in `openapi/queries/`
3. **Service Parsing** (`src/service.mts`): Uses ts-morph to parse the generated `services.gen.ts` file and extract function descriptions (method name, HTTP method, JSDoc, etc.)
4. **Export Creation** (`src/createExports.mts`): Routes methods to appropriate generators based on HTTP method:
   - GET methods → `createUseQuery()` (queries, suspense queries, infinite queries)
   - POST/PUT/PATCH/DELETE → `createUseMutation()`
5. **Hook Generators**:
   - `src/createUseQuery.mts`: Generates `useQuery`, `useSuspenseQuery`, and `useInfiniteQuery` hooks
   - `src/createUseMutation.mts`: Generates `useMutation` hooks
   - `src/createPrefetchOrEnsure.mts`: Generates `prefetchQuery` and `ensureQueryData` functions
6. **Print** (`src/print.mts`): Writes generated TypeScript to files

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

- **ts-morph**: AST manipulation for reading the generated service file
- **typescript**: AST creation for generating new TypeScript code
- **@hey-api/openapi-ts**: Base OpenAPI to TypeScript client generator

## Testing

Tests use Vitest with snapshot testing. Test files in `tests/` correspond to source modules. The `tests/utils.ts` file provides a shared `project` fixture using `examples/petstore.yaml`.

Coverage thresholds: 95% lines/functions/statements, 90% branches.
