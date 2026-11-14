# OpenAPI React Query Codegen (orqc)

> Generate [TanStack Query (React Query)](https://tanstack.com/query) code from your OpenAPI spec: `queryOptions` factories following the official TanStack Query v5 pattern, ready-to-use hooks, prefetch, ensure, suspense and infinite query helpers, and the typed fetch or axios client they call.

[![npm](https://img.shields.io/npm/v/%407nohe%2Fopenapi-react-query-codegen?label=npm)](https://www.npmjs.com/package/@7nohe/openapi-react-query-codegen)
[![npm beta](https://img.shields.io/npm/v/%407nohe%2Fopenapi-react-query-codegen/beta?label=beta)](https://www.npmjs.com/package/@7nohe/openapi-react-query-codegen?activeTab=versions)
[![npm downloads](https://img.shields.io/npm/dm/%407nohe%2Fopenapi-react-query-codegen)](https://www.npmjs.com/package/@7nohe/openapi-react-query-codegen)
[![license](https://img.shields.io/npm/l/%407nohe%2Fopenapi-react-query-codegen)](./LICENSE)

📖 **[Documentation](https://orqc.7nohe.dev)** · [Getting started](https://orqc.7nohe.dev/guides/introduction/) · [Migrating to v4](https://orqc.7nohe.dev/guides/migrating-to-v4/) · [Coming from openapi-react-query](https://orqc.7nohe.dev/guides/migrating-from-openapi-react-query/) · [Benchmarks](https://orqc.7nohe.dev/guides/benchmarks/)

## Features

- **`queryOptions` / `infiniteQueryOptions` factories** for every GET operation — the [TanStack Query v5 recommended pattern](https://tanstack.com/query/latest/docs/framework/react/guides/query-options), composable with `useQuery`, `useQueries`, `useSuspenseQuery`, `prefetchQuery`, `ensureQueryData`, and `setQueryData` with full type safety
- **Custom hooks**: `useQuery`, `useSuspenseQuery`, `useMutation`, `useInfiniteQuery`, and `useSuspenseInfiniteQuery` variants per operation
- **SSR helpers**: `prefetchQuery`, `prefetchInfiniteQuery`, and `ensureQueryData` functions per operation — ready for Next.js App Router hydration
- **Hierarchical query keys** with exported key constants and functions: invalidate one exact query, all infinite pages of an operation, or every cache entry of an operation with a single prefix
- **Pure TypeScript client** (types, SDK functions and a small fetch or axios runtime) generated from the same OpenAPI 3.0/3.1 document — no separate client generator to install
- **CI- and agent-friendly**: `--check` fails CI when committed output is out of date, `--json` prints errors as machine-readable JSON, `--agentsMd` keeps a guide in your `AGENTS.md` that lets a coding agent look one operation up instead of reading the generated files, and the package ships an [`AGENTS.md`](./AGENTS.md) for coding agents

## Quick start

> [!NOTE]
> v4 is in beta, and this README describes it. Install it with `@beta`; a plain `npm install` still gets v3, whose README and docs are in the [`v3` branch](https://github.com/7nohe/openapi-react-query-codegen/tree/v3). What changes from v3 is in [Migrating to v4](https://orqc.7nohe.dev/guides/migrating-to-v4/).

Try it without installing:

```bash
npx @7nohe/orqc@beta -i ./petstore.yaml
```

Then add it to your project, next to TanStack Query, and keep the command in a `package.json` script:

```bash
npm install -D @7nohe/openapi-react-query-codegen@beta
npm install @tanstack/react-query
npx orqc -i ./petstore.yaml
```

This writes the client to `openapi/requests/` and the TanStack Query code to `openapi/queries/` (change the folder with `-o`):

```tsx
import { useQuery } from "@tanstack/react-query";
import { findPetsOptions } from "./openapi/queries";

function Pets() {
  const { data } = useQuery(findPetsOptions({ query: { limit: 10 } }));
  // ...or use the generated hook directly: useFindPets({ query: { limit: 10 } })
}
```

See the [documentation](https://orqc.7nohe.dev) for [CLI options](https://orqc.7nohe.dev/guides/cli-options/), [usage](https://orqc.7nohe.dev/guides/usage/) (SSR, infinite queries, mutations) and [CI and coding agents](https://orqc.7nohe.dev/guides/ci-and-agents/).

## Examples

| Example | Folder |
|---|---|
| [Vite + React](https://orqc.7nohe.dev/examples/vite-react/) | [`examples/react-app`](./examples/react-app) |
| [Next.js (App Router)](https://orqc.7nohe.dev/examples/nextjs/) | [`examples/nextjs-app`](./examples/nextjs-app) |
| [TanStack Router](https://orqc.7nohe.dev/examples/tanstack-router/) | [`examples/tanstack-router-app`](./examples/tanstack-router-app) |
| [React Router 7](https://orqc.7nohe.dev/examples/react-router-7/) | [`examples/react-router-7-app`](./examples/react-router-7-app) |

> [!IMPORTANT]
> This project publishes only the scoped **`@7nohe/openapi-react-query-codegen`** and its short name **`@7nohe/orqc`**. The unscoped `openapi-react-query-codegen` and `openapi-rq` and the copies under other scopes on npm are published by third parties, not by this project.

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
| Generation time, GitHub REST API (1,272 operations)¹ | **0.46 s** | 2.98 s | 4.31 s | 2.10 s |
| Packages added by installing the generator¹ | **9** (2.1 MB) | 51 (10.8 MB) | 89 (101.5 MB) | 35 (20.5 MB) |
| Type errors in the generated code, Stripe / GitHub APIs¹ | **0 / 0** | 274 / 0 | 219 / 1 | 0 / 0 |

¹ Measured on 2026-11-13 on an Apple M2 with Node.js 24 (generation time is the median wall-clock time of the CLI), with 4.0.0-beta.4, `@hey-api/openapi-ts` 0.99.0, Orval 8.46.0 and openapi-typescript 7.13.0 + openapi-react-query 0.5.4. Methods, the other specifications and type-checking times are on the [Benchmarks](https://orqc.7nohe.dev/guides/benchmarks/) page; the scripts are in [`benchmarks/`](./benchmarks).

**Scope**: this library is deliberately React-focused and does not generate API mocks — use Orval if MSW mocks are your priority, or the hey-api plugin if you need non-React frameworks.

**Coming from openapi-typescript / openapi-fetch / openapi-react-query?** See the [migration guide](https://orqc.7nohe.dev/guides/migrating-from-openapi-react-query/).

## Stability policy

The client generator is part of this package, so the generated `requests/` directory and the hooks built on it change together and follow SemVer: breaking output changes only happen in major versions, with a migration guide (see [Migrating to v4](https://orqc.7nohe.dev/guides/migrating-to-v4/) if you are coming from v3, where the client was produced by `@hey-api/openapi-ts`).

## Requirements

- Node.js 24+
- `@tanstack/react-query` 5.x (peer dependency)
- `commander` 12–15 (peer dependency)
- TypeScript 5.x, 6.x or 7.x to compile the generated code. It is not a peer dependency: the generator does not use the `typescript` package.

## Contributing

Issues and pull requests are welcome. See the [contributing guide](https://orqc.7nohe.dev/contributing/) for the development setup.

## License

[MIT](./LICENSE)
