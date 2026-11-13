# OpenAPI React Query Codegen

> Code generator for [TanStack Query (React Query)](https://tanstack.com/query) based on your OpenAPI schema — `queryOptions` factories following the official TanStack Query v5 pattern, plus ready-to-use hooks, prefetch, ensure, suspense, and infinite query helpers.

[![npm version](https://badge.fury.io/js/%407nohe%2Fopenapi-react-query-codegen.svg)](https://badge.fury.io/js/%407nohe%2Fopenapi-react-query-codegen)

📖 **[Documentation](https://openapi-react-query-codegen.vercel.app)** · [Migrating to v3](https://openapi-react-query-codegen.vercel.app/guides/migrating-to-v3/) · [Coming from openapi-react-query](https://openapi-react-query-codegen.vercel.app/guides/migrating-from-openapi-react-query/)

## Features

- **`queryOptions` / `infiniteQueryOptions` factories** for every GET operation — the [TanStack Query v5 recommended pattern](https://tanstack.com/query/latest/docs/framework/react/guides/query-options), composable with `useQuery`, `useQueries`, `useSuspenseQuery`, `prefetchQuery`, `ensureQueryData`, and `setQueryData` with full type safety
- **Custom hooks**: `useQuery`, `useSuspenseQuery`, `useMutation`, `useInfiniteQuery`, and `useSuspenseInfiniteQuery` variants per operation
- **SSR helpers**: `prefetchQuery`, `prefetchInfiniteQuery`, and `ensureQueryData` functions per operation — ready for Next.js App Router hydration
- **Hierarchical query keys** with exported key constants and functions: invalidate one exact query, all infinite pages of an operation, or every cache entry of an operation with a single prefix
- **Pure TypeScript client** (types, SDK functions and a small fetch or axios runtime) generated from the same OpenAPI 3.0/3.1 document — no separate client generator to install
- **CI- and agent-friendly**: `--check` fails CI when committed output is out of date, `--json` prints errors as machine-readable JSON, and the package ships an [`AGENTS.md`](./AGENTS.md) for coding agents

## Quick start

```bash
npm install -D @7nohe/openapi-react-query-codegen
npx openapi-rq -i ./petstore.yaml
```

```tsx
import { useQuery } from "@tanstack/react-query";
import { findPetsOptions } from "./openapi/queries";

function Pets() {
  const { data } = useQuery(findPetsOptions({ query: { limit: 10 } }));
  // ...or use the generated hook directly: useFindPets({ query: { limit: 10 } })
}
```

See the [documentation](https://openapi-react-query-codegen.vercel.app) for CLI options, SSR recipes, and infinite query usage.

> [!IMPORTANT]
> The only package published by this project is the scoped **`@7nohe/openapi-react-query-codegen`**. The unscoped `openapi-react-query-codegen` and the copies under other scopes on npm are published by third parties, not by this project.

## How it compares

|  | This library | @hey-api tanstack-query plugin | Orval | openapi-react-query |
|---|---|---|---|---|
| `queryOptions` / `infiniteQueryOptions` factories (TanStack v5 pattern) | ✅ | ✅ | ❌ | ✅ (`$api.queryOptions`) |
| Ready-to-use hooks (`useQuery` / suspense / infinite variants) | ✅ generated per operation | ❌ (options only) | ✅ | ✅ runtime wrapper (method + path strings) |
| SSR helpers (`prefetchQuery` / `prefetchInfiniteQuery` / `ensureQueryData`) | ✅ | ❌ | Partial (`usePrefetch`) | Not provided (use `queryOptions`) |
| Hierarchical query keys for granular invalidation | ✅ | ✅ (tags) | Partial | Not documented |
| Stable release line | ✅ SemVer | pre-1.0, frequent breaking changes | ✅ | ⚠️ upstream openapi-typescript is in [maintenance mode](https://github.com/openapi-ts/openapi-typescript/issues/2874) |
| MSW mock generation | ❌ (out of scope) | ❌ | ✅ | ❌ |
| Vue / Solid / Svelte / Angular | ❌ React-focused | ✅ | ✅ | ❌ |

**Scope**: this library is deliberately React-focused and does not generate API mocks — use Orval if MSW mocks are your priority, or the hey-api plugin if you need non-React frameworks.

**Coming from openapi-typescript / openapi-fetch / openapi-react-query?** See the [migration guide](https://openapi-react-query-codegen.vercel.app/guides/migrating-from-openapi-react-query/).

## Stability policy

The client generator is part of this package, so the generated `requests/` directory and the hooks built on it change together and follow SemVer: breaking output changes only happen in major versions, with a migration guide (see [Migrating to v4](https://openapi-react-query-codegen.vercel.app/guides/migrating-to-v4/) if you are coming from v3, where the client was produced by `@hey-api/openapi-ts`).

## Requirements

- Node.js 24+
- `@tanstack/react-query` 5.x (peer dependency)
- `commander` 12–15 (peer dependency)
- TypeScript 5.x, 6.x or 7.x to compile the generated code. It is not a peer dependency: the generator does not use the `typescript` package.

## License

MIT
