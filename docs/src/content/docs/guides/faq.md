---
title: FAQ
description: Short answers about OpenAPI React Query Codegen. Supported OpenAPI and TanStack Query versions, fetch or axios, authentication, errors, infinite queries, SSR, mocks, CI and how v4 differs from v3.
---

## Getting started

### What does OpenAPI React Query Codegen generate?

It reads an OpenAPI document and writes two directories. `openapi/requests/` is a typed HTTP client: one function per operation, the request and response types, and a small fetch or axios runtime. `openapi/queries/` is TanStack Query (React Query) v5 code on top of it: for every GET operation a `useQuery` hook, a suspense hook, a `queryOptions` factory, a prefetch function, an `ensureQueryData` function and a query key function, and for every other operation a `useMutation` hook. See [Introduction](/guides/introduction/).

### Which package do I install?

`@7nohe/openapi-react-query-codegen`. Its command is `orqc` (`openapi-rq` also works). The same package is published as `@7nohe/orqc` so that `npx @7nohe/orqc@beta -i ./openapi.yaml` is short to type. The unscoped `openapi-react-query-codegen` and `openapi-rq` packages on npm, and copies under other scopes, are not published by this project.

### Is v4 stable?

v4 is in beta. `npm install -D @7nohe/openapi-react-query-codegen@beta` installs it; without `@beta` npm installs v3. This site describes v4. The v3 documentation is in the [`v3` branch](https://github.com/7nohe/openapi-react-query-codegen/tree/v3) of the repository, and [Migrating to v4](/guides/migrating-to-v4/) lists what changes.

### What does it require?

Node.js 24 or later to run the generator, and `@tanstack/react-query` 5 in the project. The generated code compiles with TypeScript 5, 6 and 7 and has no Node.js requirement of its own.

### Does it work with Vue, Svelte, Solid or Angular?

No. The generated hooks are for React. For another framework, see [Comparison](/guides/comparison/).

## The specification

### Which OpenAPI versions are supported?

OpenAPI 3.0 and 3.1, in YAML or JSON, including external `$ref`s to files and URLs. Swagger/OpenAPI 2.0 documents are rejected with an error: convert them to OpenAPI 3 first.

### Can the input be a URL?

Yes. `-i` takes a file path or an `http(s)` URL.

### What if my operations have no `operationId`?

They are named after the method and the path, such as `getPetsById`. `--noOperationId` names every operation that way.

## The generated code

### Should I commit the generated code?

That is the project's choice. If you commit it, run the generator with [`--check`](/guides/ci-and-agents/) in CI, so that a change to the specification cannot be merged without regenerating.

### Can I edit the generated files?

No. The next run overwrites them. Change the specification or the flags and regenerate. To change how one request is made, configure the client or pass options to the hook.

### Does the generated code need a runtime package?

Only `@tanstack/react-query`, and `axios` if you generate with `-c axios`. The fetch runtime is written into `openapi/requests/runtime.gen.ts`, and nothing in the output imports this package.

### Should I use fetch or axios?

`fetch` is the default and needs no package. Choose `-c axios` when the project already configures axios (instances, interceptors, adapters) and you want the generated client to use it.

### How do I set the base URL and send a token?

Configure the generated client once, before the first request:

```ts
import { client } from "./openapi/requests/client.gen";

client.setConfig({
  baseUrl: "https://api.example.com",
  // Sent with every operation that declares `security` in the specification.
  auth: () => localStorage.getItem("token") ?? undefined,
});
```

For a header on every request, whatever the specification says, add a request interceptor:

```ts
client.interceptors.request.use((request) => {
  request.headers.set("X-Tenant", "acme");
  return request;
});
```

With the axios client the option is `baseURL`, and interceptors are registered on the axios instance: `client.instance.interceptors.request.use(...)`.

### How are error responses handled?

The generated hooks reject on an error response, so `error` and `isError` are set on queries and `onError` runs on mutations, with the error typed from the responses the specification declares.

### How do infinite queries get generated?

An operation gets `useXxxInfinite` when it has a query parameter with the name given by `--pageParam` (default `page`) and its response has the property given by `--nextPageParam` (default `nextPage`, dot notation for nested values). See [Usage](/guides/usage/#using-the-generated-useinfinitequery-hooks).

### Does it work with Next.js App Router and other SSR frameworks?

Yes. Prefetch on the server with the generated `prefetchUseXxx` or `ensureUseXxxData` functions and hydrate on the client. There are examples for [Next.js](/examples/nextjs/), [React Router](/examples/react-router/) and [TanStack Router](/examples/tanstack-router/).

### Does it generate Zod schemas?

No. It writes the schemas of the specification as JSON Schema constants to `openapi/requests/schemas.gen.ts` (turn that off with `--noSchemas`), which form and validation libraries that accept JSON Schema can use.

### Can it generate mock data?

Yes. `--mock msw` writes mock data and [MSW](https://mswjs.io) request handlers for every operation. The values are fixed and taken from the specification. See [Mocking with MSW](/guides/mocking/).

## Workflow

### How do I keep the generated code up to date in CI?

Run the same command with `--check`. It generates into a temporary directory, changes nothing, and exits with `1` when the committed output differs. `--json` prints errors as one line of JSON. See [CI and Coding Agents](/guides/ci-and-agents/).

### How do I use it with a coding agent?

Add `--agentsMd` to the command. It keeps a short block in the project's `AGENTS.md` (or the file you name) that tells the agent how to find one operation with `grep` instead of reading the generated files. The package also ships its own `AGENTS.md`, and this site serves [`llms.txt`](/llms.txt). See [CI and Coding Agents](/guides/ci-and-agents/#coding-agents-agentsmd-and-llmstxt).

### How does it relate to `@hey-api/openapi-ts`?

Up to v3 the client in `openapi/requests/` was produced by `@hey-api/openapi-ts` and this package generated the hooks on top. Since v4 the client generator is part of this package, and `@hey-api/openapi-ts` is no longer a dependency. The hooks keep their names and signatures. See [Migrating to v4](/guides/migrating-to-v4/).

### How does it compare with Orval, Kubb, Hey API and openapi-react-query?

See [Comparison](/guides/comparison/) for what each generates, and [Benchmarks](/guides/benchmarks/) for generation time, install size and type errors in the output.
