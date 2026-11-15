---
title: Configuring the Client
description: Set the base URL, send a bearer token or an API key, add headers and cookies, and use request, response and error interceptors with the generated fetch or axios client.
---

Every generated hook sends its request through one client, exported from `openapi/requests/client.gen.ts`. Configure it once, in a module your application loads before the first request, and every hook uses that configuration.

```ts
// src/client.ts
import { client } from "../openapi/requests/client.gen";

client.setConfig({
  baseUrl: "https://api.example.com",
});
```

`setConfig` merges what you pass into the current configuration, so it can be called more than once. This page describes the fetch client first. [What differs with axios](#with-the-axios-client) is at the end.

## Base URL

Without configuration the client uses the first `servers` URL of the specification. Set `baseUrl` to send requests somewhere else, for example from an environment variable:

```ts
client.setConfig({
  baseUrl: import.meta.env.VITE_API_URL,
});
```

## Authentication

For operations that declare `security` in the specification, give the client a token. It is sent the way the security scheme says: as `Authorization: Bearer <token>` for an HTTP bearer scheme, as `Basic` for HTTP basic, and in the header, query parameter or cookie that an API key scheme names.

```ts
client.setConfig({
  auth: () => localStorage.getItem("token") ?? undefined,
});
```

`auth` can be a string or a function, and the function can be asynchronous. It is called for each request, so a token that changes is picked up without configuring the client again. Operations without `security` are sent without the token.

If the specification declares no `security`, send the header yourself with [`headers`](#headers-and-cookies) or with a [request interceptor](#interceptors).

## Headers and cookies

```ts
client.setConfig({
  headers: { "X-Tenant": "acme" },
  // Send cookies to another origin.
  credentials: "include",
});
```

Besides `headers`, the configuration takes the options of `fetch` itself, such as `credentials`, `cache` and `mode`.

## Interceptors

An interceptor sees every request, response or error of the client.

```ts
// Before the request is sent. Return the request to send.
client.interceptors.request.use((request) => {
  request.headers.set("X-Request-Id", crypto.randomUUID());
  return request;
});

// After a response arrives, successful or not. Return the response to use.
client.interceptors.response.use((response) => {
  if (response.status === 401) {
    window.location.assign("/login");
  }
  return response;
});

// When a request fails. What it returns becomes the error.
client.interceptors.error.use((error, response) => {
  console.error(response?.status, error);
  return error;
});
```

`use` returns an id. Pass it to `eject` to remove the interceptor: `client.interceptors.request.eject(id)`.

## Options for one request

The first argument of a query hook, and the variables of a mutation, take the same options next to `path`, `query` and `body`. They apply to that request only:

```tsx
const { data } = useFindPets({
  query: { limit: 10 },
  headers: { "Accept-Language": "ja" },
});

addPet({ body: { name: "Fluffy" }, headers: { "Idempotency-Key": key } });
```

The options of a query hook are part of its query key, so two calls with different headers are two cache entries. A query key of your own, passed as the hook's second argument, takes the place of the options in the key. Put into it whatever changes the response, such as the language, or two calls that differ only in a header share one entry.

## Errors

When the server answers with an error status, the generated hooks reject. `error` is the body of the response, parsed as JSON when it is JSON, and typed from the error responses the specification declares:

```tsx
const { error } = useFindPets();
// error: { code: number; message: string } | null
```

The functions in `sdk.gen.ts` behave differently when you call them yourself: they resolve to `{ data, error }` and do not throw, unless you pass `throwOnError: true` or set it with `client.setConfig`.

## With the axios client

With `-c axios` the configuration takes the options of axios instead of those of `fetch`. Three things differ:

- The base URL option is `baseURL`.
- Interceptors are those of axios, on the instance the client uses: `client.instance.interceptors.request.use(...)`.
- An error is an `AxiosError`, so the body is `error.response?.data`.

```ts
import { client } from "../openapi/requests/client.gen";

client.setConfig({
  baseURL: "https://api.example.com",
  auth: () => localStorage.getItem("token") ?? undefined,
});

client.instance.interceptors.request.use((config) => {
  config.headers.set("X-Tenant", "acme");
  return config;
});
```

`auth`, `headers` and the options for one request work as described above.

## Server rendering

A framework that bundles server and browser code separately has two copies of the client, and each one needs the configuration. See the [Next.js example](/examples/nextjs/#configure-the-client-and-the-provider).
