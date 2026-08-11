---
title: TanStack Router Example
description: Using TanStack Router with OpenAPI React Query Codegen for data loading and prefetching.
---

Example of using TanStack Router can be found in the [`examples/tanstack-router-app`](https://github.com/7nohe/openapi-react-query-codegen/tree/main/examples/tanstack-router-app) directory of the repository.

## Route Data Loading

Use the generated `ensureQueryData` functions in your route loaders to prefetch data before the route renders:

```tsx
// routes/pets.$petId.tsx
import { createFileRoute } from "@tanstack/react-router";
import { ensureUseFindPetByIdData } from "../openapi/queries/ensureQueryData";
import { useFindPetById } from "../openapi/queries";
import { queryClient } from "../queryClient";

export const Route = createFileRoute("/pets/$petId")({
  loader: ({ params }) =>
    ensureUseFindPetByIdData(queryClient, {
      path: { petId: Number(params.petId) },
    }),
  component: PetDetail,
});

function PetDetail() {
  const { petId } = Route.useParams();
  const { data } = useFindPetById({ path: { petId: Number(petId) } });

  return <div>{data?.name}</div>;
}
```

### For SSR / TanStack Start

When using SSR or TanStack Start, pass `queryClient` from the router context:

```tsx
export const Route = createFileRoute("/pets/$petId")({
  loader: ({ context, params }) =>
    ensureUseFindPetByIdData(context.queryClient, {
      path: { petId: Number(params.petId) },
    }),
  component: PetDetail,
});
```

### Operations Without Path Parameters

```tsx
import { ensureUseFindPetsData } from "../openapi/queries/ensureQueryData";

export const Route = createFileRoute("/pets")({
  loader: () => ensureUseFindPetsData(queryClient),
  component: PetList,
});
```

## Prefetching on Hover/Touch

Use `prefetchQuery` functions for custom prefetch triggers:

```tsx
import { prefetchUseFindPetById } from "../openapi/queries/prefetch";
import { queryClient } from "../queryClient";

function PetLink({ petId }: { petId: number }) {
  const handlePrefetch = () => {
    prefetchUseFindPetById(queryClient, { path: { petId } });
  };

  return (
    <a
      href={`/pets/${petId}`}
      onMouseEnter={handlePrefetch}
      onTouchStart={handlePrefetch}
    >
      View Pet
    </a>
  );
}
```

## Router Configuration

### External Cache Settings

When using TanStack Query as an external cache, configure the router to delegate cache freshness to React Query:

```tsx
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
  routeTree,
  defaultPreloadStaleTime: 0, // Let React Query handle cache freshness
});
```

### Link Preloading

TanStack Router's `<Link>` component supports intent-based preloading:

```tsx
<Link to="/pets/$petId" params={{ petId: "1" }} preload="intent">
  View Pet
</Link>
```

Or set it globally:

```tsx
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
});
```

When using `preload="intent"`, the router automatically calls the route's `loader` on hover/touch.

## Important Notes

### Router Params Are Strings

TanStack Router params are always strings. You must parse them to the correct type:

```tsx
loader: ({ params }) =>
  ensureUseFindPetByIdData(queryClient, {
    path: { petId: Number(params.petId) }, // Convert string to number
  }),
```

For type-safe parsing, consider using TanStack Router's `parseParams`:

```tsx
export const Route = createFileRoute("/pets/$petId")({
  parseParams: (params) => ({
    petId: Number(params.petId),
  }),
  loader: ({ params }) =>
    ensureUseFindPetByIdData(queryClient, {
      path: { petId: params.petId }, // Already a number
    }),
});
```
