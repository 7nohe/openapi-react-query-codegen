---
title: Next.js Example
description: A Next.js App Router example that prefetches on the server and hydrates TanStack Query hooks generated from an OpenAPI document.
---

Example of using Next.js can be found in the [`examples/nextjs-app`](https://github.com/7nohe/openapi-react-query-codegen/tree/main/examples/nextjs-app) directory of the repository. It uses the App Router: a Server Component prefetches a query, and a Client Component reads the same data through the generated hook without fetching it again.

## Generate the code

```json
{ "scripts": { "codegen": "orqc -i ./petstore.yaml" } }
```

The command writes the client to `openapi/requests/` and the TanStack Query code to `openapi/queries/`. The default client uses `fetch`, which is what the server needs too.

## Configure the client and the provider

Set the base URL in one module:

```ts
// fetchClient.ts
import { client } from "@/openapi/requests/client.gen";

client.setConfig({
  baseUrl: "http://localhost:4010",
});
```

Next.js bundles Server Components and Client Components separately, so each side has its own copy of the generated client. Import this module on both: in the provider below for the browser, and in every Server Component that prefetches. A Server Component that leaves it out sends its request to the server URL written in the specification.

The `QueryClientProvider` needs a Client Component. Create one `QueryClient` per request on the server and keep a single one in the browser:

```tsx
// app/providers.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../fetchClient";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Above 0, so the browser does not refetch what the server just sent.
        staleTime: 60 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}
```

Wrap the application with it in `app/layout.tsx`.

## Prefetch in a Server Component

Every GET operation has a prefetch function in `openapi/queries/prefetch`. Call it in a Server Component, then pass the cache to the browser with `HydrationBoundary`:

```tsx
// app/page.tsx
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import "../fetchClient";
import { prefetchUseFindPets } from "../openapi/queries/prefetch";
import Pets from "./components/Pets";

export default async function Home() {
  const queryClient = new QueryClient();

  await prefetchUseFindPets(queryClient, {
    query: { tags: [], limit: 10 },
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Pets />
    </HydrationBoundary>
  );
}
```

## Read the data in a Client Component

```tsx
// app/components/Pets.tsx
"use client";

import { useFindPets } from "@/openapi/queries";

export default function Pets() {
  const { data } = useFindPets({
    query: { tags: [], limit: 10 },
  });

  return (
    <ul>
      {data?.map((pet) => (
        <li key={pet.id}>{pet.name}</li>
      ))}
    </ul>
  );
}
```

Pass the hook the same options as the prefetch function, and no query key of your own as its second argument. The query key is the operation's key followed by the options, and a key of your own takes the place of the options. Either difference is a different cache entry, and the browser fetches again.

## Infinite queries

A paginated operation also gets a prefetch function for its first page. The Client Component continues from there with `fetchNextPage`:

```tsx
// app/infinite-loader/page.tsx
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import "../../fetchClient";
import { prefetchUseFindPaginatedPetsInfinite } from "../../openapi/queries/prefetch";
import PaginatedPets from "../components/PaginatedPets";

export default async function InfiniteLoaderPage() {
  const queryClient = new QueryClient();

  await prefetchUseFindPaginatedPetsInfinite(queryClient, {
    query: { limit: 10, tags: [] },
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PaginatedPets />
    </HydrationBoundary>
  );
}
```

```tsx
// app/components/PaginatedPets.tsx
"use client";

import { useFindPaginatedPetsInfinite } from "@/openapi/queries/infiniteQueries";

export default function PaginatedPets() {
  const { data, fetchNextPage } = useFindPaginatedPetsInfinite({
    query: { limit: 10, tags: [] },
  });

  return (
    <>
      <ul>
        {data?.pages.flatMap((page) =>
          page?.pets?.map((pet) => <li key={pet.id}>{pet.name}</li>),
        )}
      </ul>
      {data?.pages.at(-1)?.nextPage && (
        <button type="button" onClick={() => fetchNextPage()}>
          Load more
        </button>
      )}
    </>
  );
}
```

An operation is paginated when it has the query parameter named by [`--pageParam`](/guides/cli-options/#--pageparam-value). See [Usage](/guides/usage/#using-the-generated-useinfinitequery-hooks) for the details.

## Run the example

From the root of the repository:

```bash
pnpm install
pnpm build
pnpm --filter nextjs-app generate:api
pnpm --filter nextjs-app dev
```

`dev` starts Next.js and a small mock Petstore server on `http://localhost:4010`.
