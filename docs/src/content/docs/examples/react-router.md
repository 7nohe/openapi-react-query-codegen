---
title: React Router Example
description: A React Router 8 (framework mode) example that loads data with TanStack Query code generated from an OpenAPI document.
---

Example of using React Router 8 in framework mode can be found in the [`examples/react-router-app`](https://github.com/7nohe/openapi-react-query-codegen/tree/main/examples/react-router-app) directory of the repository. A route `loader` prefetches a query on the server, and the route component reads the same data through the generated hook.

React Router 8 needs Node.js 22.22 or later and React 19.2.7 or later. Import everything from `react-router`: `react-router-dom` has no v8.

## Generate the code

```json
{ "scripts": { "codegen": "orqc -i ./petstore.yaml" } }
```

## Configure the client and the provider

```ts
// fetchClient.ts
import { client } from "./openapi/requests/client.gen";

client.setConfig({
  baseUrl: "http://localhost:4010",
  throwOnError: true,
});
```

```tsx
// providers.tsx
import "./fetchClient";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Above 0, so the browser does not refetch what the server just sent.
            staleTime: 30 * 1000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

Wrap `<Outlet />` with it in `app/root.tsx`.

## Prefetch in the loader

Call the generated prefetch function in the route's `loader` and return the dehydrated cache. The component hands it to `HydrationBoundary`:

```tsx
// app/routes/_index/route.tsx
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import { useFindPets } from "../../../openapi/queries";
import { prefetchUseFindPets } from "../../../openapi/queries/prefetch";
import type { Route } from "./+types/route";

export async function loader(_: Route.LoaderArgs) {
  const queryClient = new QueryClient();

  await prefetchUseFindPets(queryClient, {
    query: { tags: [], limit: 10 },
  });

  return { dehydratedState: dehydrate(queryClient) };
}

function Pets() {
  const { data } = useFindPets({ query: { tags: [], limit: 10 } });

  return (
    <ul>
      {data?.map((pet) => (
        <li key={pet.id}>{pet.name}</li>
      ))}
    </ul>
  );
}

export default function Index({ loaderData }: Route.ComponentProps) {
  return (
    <HydrationBoundary state={loaderData.dehydratedState}>
      <Pets />
    </HydrationBoundary>
  );
}
```

Pass the hook the same options as the prefetch function, and no query key of your own as its second argument. The query key is built from both, so anything different is a different cache entry and the browser fetches again.

## Mutation and invalidation

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { UseFindPetsKeyFn, useAddPet } from "../../../openapi/queries";

function AddPet({ name }: { name: string }) {
  const queryClient = useQueryClient();
  const { mutate: addPet } = useAddPet();

  return (
    <button
      type="button"
      onClick={() =>
        addPet(
          { body: { name } },
          {
            onSuccess: () =>
              queryClient.invalidateQueries({
                queryKey: UseFindPetsKeyFn({ query: { tags: [], limit: 10 } }),
              }),
          },
        )
      }
    >
      Create a pet
    </button>
  );
}
```

## Run the example

From the root of the repository:

```bash
pnpm install
pnpm build
pnpm --filter @7nohe/react-router-app generate:api
pnpm --filter @7nohe/react-router-app dev
```

`dev` starts React Router and a small mock Petstore server on `http://localhost:4010`.
