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

## Type patches for dependencies

This project compiles with `skipLibCheck: false`, so type errors inside dependency declaration files fail the build. Two mechanisms keep it green:

- `patches/` contains [pnpm patches](https://pnpm.io/cli/patch) that insert `// @ts-ignore` comments over known typing bugs in the bundled declaration files of `@hey-api/openapi-ts` and `@hey-api/shared`. No implementation code is modified.
- `src/vendor-typestubs.d.ts` stubs modules referenced by `@hey-api/openapi-ts` type declarations but not installed here (framework-specific client plugins such as `ky`, `ofetch`, `nuxt/app`, `@angular/*`).

When upgrading `@hey-api/openapi-ts`, recreate the patches against the new version:

```bash
pnpm patch @hey-api/openapi-ts@<new-version>
# edit the printed directory, then
pnpm patch-commit <printed-directory>
```

Run `pnpm build` afterwards — any remaining declaration errors point to patches or stubs that need updating, and patches that no longer apply can be removed.
