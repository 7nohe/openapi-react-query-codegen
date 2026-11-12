# AGENTS.md

This file has two parts:

- **[Using this package](#using-this-package)**: for coding agents working in a project that depends on `@7nohe/openapi-react-query-codegen`. This file ships in the npm package, at `node_modules/@7nohe/openapi-react-query-codegen/AGENTS.md`.
- **[Working on this repository](#working-on-this-repository)**: for agents changing the generator itself.

## Using this package

`@7nohe/openapi-react-query-codegen` is a CLI (`openapi-rq`) that reads an OpenAPI spec and generates:

1. a TypeScript HTTP client (via `@hey-api/openapi-ts`) in `<output>/requests/`
2. TanStack Query v5 hooks and helpers on top of that client in `<output>/queries/`

Docs: https://openapi-react-query-codegen.vercel.app (summary for LLMs: https://openapi-react-query-codegen.vercel.app/llms.txt)

### Install

```bash
npm install -D @7nohe/openapi-react-query-codegen
npm install @tanstack/react-query
```

`commander`, `ts-morph` and `typescript` are peer dependencies. If your package manager does not install peers automatically, add them as devDependencies. For `--client @hey-api/client-axios`, also add `axios`. Do not install `@hey-api/client-fetch` / `@hey-api/client-axios`; the client code is generated into `requests/`.

Only the scoped `@7nohe/openapi-react-query-codegen` package belongs to this project. The unscoped `openapi-react-query-codegen` on npm is someone else's.

### Run

Add a script and run it whenever the spec changes:

```json
{ "scripts": { "codegen": "openapi-rq -i ./openapi.yaml -o ./src/openapi" } }
```

| Flag | Default | Notes |
| --- | --- | --- |
| `-i, --input <path\|url\|content>` | (required) | OpenAPI 2.0/3.x spec |
| `-o, --output <dir>` | `openapi` | `requests/` and `queries/` are created inside |
| `-c, --client <name>` | `@hey-api/client-fetch` | or `@hey-api/client-axios` |
| `--format <biome\|prettier>` | none | formats `queries/` only |
| `--lint <biome\|eslint>` | none | lints/fixes `queries/` only |
| `--enums <javascript\|typescript>` | none | emit enum objects |
| `--useDateType` | off | `Date` for `date`/`date-time`, converted at runtime |
| `--noOperationId` | off | derive names from paths instead of `operationId` |
| `--noSchemas` / `--schemaType <json\|form>` | schemas on, `json` | JSON schema export |
| `--pageParam <name>` | `page` | query param that turns a GET into an infinite query |
| `--nextPageParam <path>` | `nextPage` | response field holding the next page (dot path allowed, e.g. `meta.next`) |
| `--initialPageParam <value>` / `--omitInitialPageParam` | `1` | first page value, or send none |
| `--check` | off | write nothing; exit 1 if the output is out of date (see below) |
| `--json` | off | errors as one JSON line on stderr (see below) |

Pass the **same flags** every time (keep them in the package.json script). Different flags produce different output, so `--check` with other flags reports drift.

### Generated layout

```
<output>/
├── queries/              # TanStack Query layer (this package)
│   ├── index.ts          # re-exports common, queries, queryOptions
│   ├── common.ts         # query keys, key functions, result types
│   ├── queries.ts        # useQuery and useMutation hooks
│   ├── queryOptions.ts   # queryOptions()/infiniteQueryOptions() factories
│   ├── suspense.ts       # useSuspenseQuery hooks
│   ├── infiniteQueries.ts# useInfiniteQuery hooks
│   ├── prefetch.ts       # prefetchQuery helpers
│   └── ensureQueryData.ts# ensureQueryData helpers
└── requests/             # HTTP client from @hey-api/openapi-ts
    ├── client.gen.ts     # `client` instance (setConfig, interceptors)
    ├── sdk.gen.ts        # one function per operation
    ├── services.gen.ts   # compatibility shim: re-exports client.gen + sdk.gen
    └── types.gen.ts      # request/response types
```

Never edit generated files; change the spec or the flags and regenerate. Whether to commit the output is the project's choice. If it is committed, add the `--check` step below to CI.

### Using the generated code

Names come from the operation ID (or from the path with `--noOperationId`). For a GET operation `findPets` and a POST `addPet`:

| Export | File | Use |
| --- | --- | --- |
| `useFindPets(clientOptions?, queryKey?, options?)` | `queries.ts` | `useQuery` |
| `useFindPetsSuspense(...)` | `suspense.ts` | `useSuspenseQuery` |
| `useFindPetsInfinite(...)` | `infiniteQueries.ts` | only when the GET has the `--pageParam` query param |
| `useFindPetsSuspenseInfinite(...)`, `prefetchUseFindPetsInfinite(...)` | `suspense.ts`, `prefetch.ts` | same condition as above |
| `findPetsOptions(clientOptions?, queryKey?)` | `queryOptions.ts` | pass to `useQuery`, `useQueries`, loaders |
| `prefetchUseFindPets(queryClient, clientOptions?, options?)` | `prefetch.ts` | SSR / route loaders |
| `ensureUseFindPetsData(queryClient, clientOptions?, options?)` | `ensureQueryData.ts` | route loaders |
| `useFindPetsKey`, `UseFindPetsKeyFn(clientOptions?)` | `common.ts` | `invalidateQueries` with the same key the hook uses |
| `useAddPet(mutationKey?, options?)` | `queries.ts` | `useMutation`; `mutate({ body, path, query })` |

`clientOptions` is the SDK options object: `{ path, query, body, headers }`, typed from `requests/types.gen.ts`. Mutation results are the full SDK response (`data`, plus `response` for fetch or `headers` for axios).

```tsx
// once, at app start: configure the generated client
import { client } from "./openapi/requests/services.gen";
client.setConfig({ baseUrl: "https://api.example.com" }); // axios client: baseURL

// in components
import { useQueryClient } from "@tanstack/react-query";
import { UseFindPetsKeyFn, useAddPet, useFindPets } from "./openapi/queries";

const clientOptions = { query: { limit: 10 } };
const { data } = useFindPets(clientOptions);
const queryClient = useQueryClient();
// The first argument of a mutation hook is the mutation key.
const { mutate } = useAddPet(undefined, {
  // Build the key with the same function and arguments the query hook used.
  onSuccess: () =>
    queryClient.invalidateQueries({ queryKey: UseFindPetsKeyFn(clientOptions) }),
});
mutate({ body: { name: "Fluffy" } });
```

Wrap the app in TanStack Query's `QueryClientProvider` as usual.

### CI drift check: `--check`

```bash
openapi-rq -i ./openapi.yaml -o ./src/openapi --check
```

Generates into a temporary sibling directory (`.openapi-rq-check-*`, removed afterwards), compares it with `<output>/requests` and `<output>/queries`, and writes nothing. Each file is `added` (would be created), `modified` or `removed` (no longer generated).

### Exit codes and `--json`

| Exit code | Meaning |
| --- | --- |
| `0` | success, or `--check` found no differences |
| `1` | `--check` found differences |
| `2` | error (bad flags, unreadable spec, generation failure) |

With `--json`, a failure prints exactly one line of JSON on stderr, and @hey-api/openapi-ts's own logs are silenced:

```json
{"code":"OUTPUT_OUT_OF_DATE","message":"Generated output is out of date (1 file differs). ...","details":{"files":[{"path":"src/openapi/queries/queries.ts","status":"modified"}]}}
```

| `code` | When | `details` |
| --- | --- | --- |
| `INVALID_ARGUMENT` | unknown flag, bad choice, missing `-i` | `commanderCode` |
| `INPUT_NOT_FOUND` | spec file missing or URL request failed | `input` |
| `INPUT_PARSE_ERROR` | spec is not valid YAML/JSON | `input`, `reason` |
| `CLIENT_GENERATION_FAILED` | @hey-api/openapi-ts failed otherwise | `input`, `reason`, `name` |
| `GENERATION_FAILED` | hook generation failed | `name` |
| `OUTPUT_OUT_OF_DATE` | `--check` found differences (exit 1) | `files: [{ path, status }]` |

Branch on `code`, not on `message`. Codes are stable; messages may change.

### Programmatic API

```ts
import { check, generate } from "@7nohe/openapi-react-query-codegen";
```

`generate(options, version)` and `check(options, version)` take the same options as the CLI flags. `check` resolves to `{ upToDate, files }`. Errors are `CodegenError` instances with `code` and `details`.

## Working on this repository


### Project Structure & Module Organization
- Source code lives in `src/` (CLI entry `cli.mts`, generator pipeline `generate.mts`, codegen helpers like `createSource.mts`, `createImports.mts`, `createExports.mts`, `service.mts`, formatting in `format.mts`).
- Tests reside in `tests/` (Vitest).
- Example apps under `examples/` (React/Next.js/TanStack Router) consume the generated client.
- Docs site in `docs/` (Astro). Build artifacts output to `dist/`.

### Build, Test, and Development Commands
- Install: `pnpm install`
- Build generator: `pnpm build` (cleans `dist/`, runs `tsc`).
- Lint/format check: `pnpm lint` (Biome). Auto-fix: `pnpm lint:fix`.
- Tests: `pnpm test` (Vitest with coverage). Snapshots: `pnpm snapshot`.
- Preview generation into examples: `pnpm preview:react`, `pnpm preview:nextjs`, `pnpm preview:tanstack-router`.

### Coding Style & Naming Conventions
- Language: TypeScript (strict, ESNext, NodeNext). Keep code in modules (`.mts`), output compiled to `dist/`.
- Formatting/linting via Biome: 2-space indent, double quotes, trailing commas, organized imports. Run formatters before committing.
- Generated outputs include a header comment with package version; preserve this when modifying generation.
- Prefer descriptive function names and explicit types; avoid implicit `any`.

### Testing Guidelines
- Framework: Vitest. Coverage enabled by default.
- Place tests in `tests/`; mirror generator behavior with snapshot tests where helpful.
- After generator changes, run tests and consider regenerating example outputs to manually diff.

### Commit & Pull Request Guidelines
- Commits: clear, descriptive messages (e.g., `fix: align imports for generated queries`, `chore: update ts-morph config`). Avoid bundling unrelated changes.
- Pull requests: include summary of changes, affected areas (e.g., codegen output, docs, examples), and test commands run. Link issues when applicable. Add before/after notes or sample generated snippets if behavior changes.

### Architecture: IR Boundary (Backend Portability)
- The generation pipeline is split by an intermediate representation (IR): `OperationInfo` and `GenerationContext` in `src/types.mts`.
- hey-api-specific knowledge must stay confined to the parsing side: the `createClient` invocation in `src/generate.mts` and the `sdk.gen`/`types.gen` parsing in `src/service.mts` / `src/createSource.mts`.
- Generation-side modules (`src/tsmorph/build*.mts`, `generateFiles.mts`) should consume only the IR. Do not add new hey-api-specific parsing or imports there; extend the IR instead.
- This boundary is what keeps the generator portable to a different SDK backend without rewriting the generation layer. Treat leaks across it as review findings.

### hey-api Version Policy
- `@hey-api/openapi-ts` is pinned to an exact version and patched via `pnpm.patchedDependencies` when needed (see `patches/`).
- Upgrades: bump the pin, run the full snapshot suite, regenerate an example app and type-check it, then release as a minor version. Breaking changes in hey-api are absorbed here — they must not leak into the generated API surface outside a major version.

### Agent-Specific Notes
- Use AST-aware paths (ts-morph/TypeScript factory) when editing generators to keep output structurally valid.
- Respect ignore patterns in `biome.json` and avoid checking in `dist/` or example-generated artifacts unless explicitly intended.
