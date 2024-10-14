---
title: Contributing
description: Contributing to OpenAPI React Query Codegen.
---

## Prerequisites

- Node.js v20.16.0 or later
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
