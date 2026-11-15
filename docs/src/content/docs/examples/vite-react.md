---
title: Vite + React Example
description: A Vite + React example app that calls an API through TanStack Query hooks generated from an OpenAPI document.
---

Example of using Vite with React can be found in the [`examples/react-app`](https://github.com/7nohe/openapi-react-query-codegen/tree/main/examples/react-app) directory of the repository. It is a single-page app on the axios client that reads a list, adds to it with a mutation and shows a suspense query.

## Generate the code

```json
{ "scripts": { "codegen": "orqc -i ./petstore.yaml -c axios" } }
```

`-c axios` generates the client on axios, so install `axios` in the project. Without the flag the client uses `fetch` and needs no package.

## Configure the client and the provider

```ts
// src/axios.ts
import { client } from "../openapi/requests/client.gen";

client.setConfig({
  baseURL: "http://localhost:4010",
});
```

The axios client takes `baseURL`, as axios does. The fetch client takes `baseUrl`.

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./axios";

export const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

## Query

```tsx
import { useFindPets } from "../openapi/queries";

function Pets() {
  const { data, error, refetch } = useFindPets({
    query: { tags: [], limit: 10 },
  });

  if (error)
    return (
      <button type="button" onClick={() => refetch()}>
        Retry
      </button>
    );

  return (
    <ul>
      {data?.map((pet) => (
        <li key={pet.id}>{pet.name}</li>
      ))}
    </ul>
  );
}
```

When every parameter of an operation is optional, the hook can be called with no argument: `useFindPets()`.

## Mutation and invalidation

A mutation hook takes the request as the variables of `mutate`. After it succeeds, invalidate the list with the key function of the query, called with the same options the query was called with:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { UseFindPetsKeyFn, useAddPet } from "../openapi/queries";

function AddPet({ name }: { name: string }) {
  const queryClient = useQueryClient();
  const { mutate: addPet, isPending } = useAddPet();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        addPet(
          { body: { name } },
          {
            onSuccess: () =>
              queryClient.invalidateQueries({
                queryKey: UseFindPetsKeyFn({ query: { tags: [], limit: 10 } }),
              }),
            // With the axios client the error is an AxiosError.
            onError: (error) => console.log(error.response?.data.message),
          },
        )
      }
    >
      Create a pet
    </button>
  );
}
```

To cancel a mutation, pass an `AbortSignal` next to the body: `addPet({ body, signal: controller.signal })`.

## Suspense

The suspense hooks are in `openapi/queries/suspense`. `data` is never `undefined` there. An error is thrown to the nearest error boundary when there is no data to show; if a refetch fails while data is cached, the component keeps rendering that data:

```tsx
import { Suspense } from "react";
import { useFindPetsSuspense } from "../openapi/queries/suspense";

function PetList() {
  const { data } = useFindPetsSuspense({ query: { tags: [], limit: 10 } });

  return (
    <ul>
      {data.map((pet) => (
        <li key={pet.id}>{pet.name}</li>
      ))}
    </ul>
  );
}

export function Pets() {
  return (
    <Suspense fallback={<>loading...</>}>
      <PetList />
    </Suspense>
  );
}
```

## Run the example

From the root of the repository:

```bash
pnpm install
pnpm build
pnpm --filter @7nohe/react-app generate:api
pnpm --filter @7nohe/react-app dev
```

`dev` starts Vite and a small mock Petstore server on `http://localhost:4010`.
