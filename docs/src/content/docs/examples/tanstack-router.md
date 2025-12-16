---
title: TanStack Router Example
description: Using TanStack Router with OpenAPI React Query Codegen for data loading and prefetching.
---

Example of using TanStack Router can be found in the [`examples/tanstack-router-app`](https://github.com/7nohe/openapi-react-query-codegen/tree/main/examples/tanstack-router-app) directory of the repository.

## Generated Files

The codegen generates a `router.ts` file that provides:

- **Loader factories** (`loaderUse*`) for route data loading
- **`withQueryPrefetch`** helper for hover/touch prefetching

## Using Loader Factories

Use `loaderUse*` functions in your route definitions to prefetch data before the route renders:

```tsx
// routes/pets.$petId.tsx
import { createFileRoute } from "@tanstack/react-router";
import { loaderUseFindPetById } from "../openapi/queries/router";
import { queryClient } from "../queryClient";

export const Route = createFileRoute("/pets/$petId")({
  loader: ({ params }) =>
    loaderUseFindPetById({ queryClient })({
      params: { petId: Number(params.petId) },
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

When using SSR or TanStack Start, pass `queryClient` from the router context instead of importing it directly:

```tsx
export const Route = createFileRoute("/pets/$petId")({
  loader: ({ context, params }) =>
    loaderUseFindPetById({ queryClient: context.queryClient })({
      params: { petId: Number(params.petId) },
    }),
  component: PetDetail,
});
```

### Operations Without Path Parameters

For operations without path parameters, the loader is simpler:

```tsx
import { loaderUseFindPets } from "../openapi/queries/router";

export const Route = createFileRoute("/pets")({
  loader: () => loaderUseFindPets({ queryClient })(),
  component: PetList,
});
```

### Passing Additional Options

You can pass additional client options through the `clientOptions` parameter:

```tsx
loader: ({ params }) =>
  loaderUseFindPetById({
    queryClient,
    clientOptions: {
      headers: { "X-Custom-Header": "value" },
    },
  })({
    params: { petId: Number(params.petId) },
  }),
```

## Using withQueryPrefetch

The `withQueryPrefetch` helper enables prefetching on hover or touch events. This is useful for custom prefetch triggers outside of TanStack Router's built-in `<Link>` preloading:

```tsx
import { withQueryPrefetch } from "../openapi/queries/router";
import { prefetchUseFindPetById } from "../openapi/queries/prefetch";
import { queryClient } from "../queryClient";

function PetLink({ petId }: { petId: number }) {
  return (
    <a
      href={`/pets/${petId}`}
      {...withQueryPrefetch(() =>
        prefetchUseFindPetById(queryClient, { path: { petId } })
      )}
    >
      View Pet
    </a>
  );
}
```

This spreads `onMouseEnter` and `onTouchStart` handlers that trigger the prefetch.

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

When using `preload="intent"`, the router automatically calls the route's `loader` on hover/touch. If your loader uses `ensureUse*Data` (which the generated loaders do), prefetching happens automatically.

## Important Notes

### Router Params Are Strings

TanStack Router params are always strings. You must parse them to the correct type before passing to the loader:

```tsx
// Router params: { petId: string }
// API expects: { petId: number }
loader: ({ params }) =>
  loaderUseFindPetById({ queryClient })({
    params: { petId: Number(params.petId) }, // Convert string to number
  }),
```

For type-safe parsing, consider using TanStack Router's `parseParams`:

```tsx
export const Route = createFileRoute("/pets/$petId")({
  parseParams: (params) => ({
    petId: Number(params.petId),
  }),
  loader: ({ params }) =>
    loaderUseFindPetById({ queryClient })({
      params: { petId: params.petId }, // Already a number
    }),
});
```
