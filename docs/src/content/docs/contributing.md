---
title: Contributing
description: Contributing to OpenAPI React Query Codegen.
---

## Prerequisites

- Node.js v24 or later
- pnpm v9

## Install dependencies

```bash
pnpm install
```

## Run tests
```bash
pnpm test
```

## Run linter
```bash
pnpm lint
```

## Run linter and fix
```bash
pnpm lint:fix
```

## Update snapshots
```bash
pnpm snapshot
```

## Build example and validate generated code

```bash
npm run build && pnpm --filter @7nohe/react-app generate:api && pnpm --filter @7nohe/react-app test:generated 
```

## Preview the docs
  
```bash
pnpm --filter docs dev
```

## Architecture: the client generator and the IR boundary

`src/client/` turns the OpenAPI document into the `requests/` directory (`types.gen.ts`, `sdk.gen.ts`, `client.gen.ts`, `runtime.gen.ts`, and on request `schemas.gen.ts` and `transformers.gen.ts`) and returns the normalized operations (`OperationInfo` in `src/types.mts`) to the hook generators in `src/hooks/`. The hook generators consume only that intermediate representation and `GenerationContext`; they never read the generated SDK or the OpenAPI document. Please flag any change that makes them do so.

The generated hooks rely on a small SDK contract that `src/client/emitSdk.mts` and the runtimes in `src/client/runtime/` must keep:

- `Options<XData, ThrowOnError>` is exported from `sdk.gen.ts`.
- An SDK call resolves to `{ data, … }` and rejects with the error when `throwOnError` is set.
- The `XData`, `XResponses`, `XErrors` and `XError` type names, with `XError` present only when the operation declares error responses.

## The runtimes

`src/client/runtime/fetch.runtime.ts` and `axios.runtime.ts` are ordinary TypeScript files that are copied verbatim into users' projects, so they must compile under strict settings, `verbatimModuleSyntax` and both bundler and NodeNext resolution. The tests import them directly and run them against a local HTTP server; `tests/client/generateClient.test.ts` compiles a generated client under each module resolution. `scripts/copy-runtime.mjs` copies them next to the compiled generator during `pnpm build`.

## Dependencies

Runtime dependencies are intentionally few (`cross-spawn` and `yaml`). Adding one needs a reason: the built-in client generator exists to keep the supply-chain surface small.
