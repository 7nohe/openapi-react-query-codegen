/**
 * Type-level regression tests for the generated infinite query surface.
 *
 * This file is never executed — `test:generated` runs `tsc --noEmit` over it,
 * so anything that stops type checking is a regression. It pins the shape of
 * the `getNextPageParam` override slot, which used to hand callers the
 * aggregated `InfiniteData<...>` instead of a single page (#203, #139).
 */
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { useInfiniteQuery } from "@tanstack/react-query";
import type * as Common from "../openapi/queries/common";
import { useFindPaginatedPetsInfinite } from "../openapi/queries/infiniteQueries";
import { prefetchUseFindPaginatedPetsInfinite } from "../openapi/queries/prefetch";
import { findPaginatedPetsInfiniteOptions } from "../openapi/queries/queryOptions";
import { useFindPaginatedPetsSuspenseInfinite } from "../openapi/queries/suspense";

/** One page of the paginated response. */
type Page = NonNullable<Common.FindPaginatedPetsDefaultResponse>;

/** Fails to instantiate unless T and U are mutually assignable. */
type Exact<T, U> = [T] extends [U] ? ([U] extends [T] ? true : never) : never;

/** The exact override the issue reports as uncompilable. */
const getNextPageParam = (lastPage: Page) =>
  lastPage.pets?.length === 0 ? undefined : lastPage.nextPage;

export function useInfiniteHookTypes() {
  // #203: `lastPage` is a single page, so the override needs no cast.
  const query = useFindPaginatedPetsInfinite({}, undefined, {
    getNextPageParam: (lastPage) =>
      lastPage.pets?.length === 0 ? undefined : lastPage.nextPage,
  });

  // The callback parameter is exactly one page, never InfiniteData<Page>.
  useFindPaginatedPetsInfinite({}, undefined, {
    getNextPageParam: (lastPage) => {
      const isPage: Exact<typeof lastPage, Page> = true;
      return isPage ? 1 : undefined;
    },
  });

  // Non-pagination options still work alongside the overrides.
  useFindPaginatedPetsInfinite({}, undefined, {
    enabled: false,
    getNextPageParam,
  });

  // The default TData stays the aggregated InfiniteData of the response.
  const defaultData: Exact<
    typeof query.data,
    InfiniteData<Common.FindPaginatedPetsDefaultResponse> | undefined
  > = true;

  // Explicit TData still overrides the result type.
  const custom = useFindPaginatedPetsInfinite<{ mine: true }>();
  const customData: Exact<typeof custom.data, { mine: true } | undefined> =
    true;

  return { defaultData, customData };
}

export function useSuspenseInfiniteHookTypes() {
  const query = useFindPaginatedPetsSuspenseInfinite({}, undefined, {
    getNextPageParam: (lastPage) => {
      const isPage: Exact<typeof lastPage, Page> = true;
      return isPage ? 1 : undefined;
    },
  });

  const data: Exact<typeof query.data, InfiniteData<Page>> = true;
  return data;
}

export function prefetchInfiniteTypes(queryClient: QueryClient) {
  // #203: prefetch forbade the overrides outright, even though `...options`
  // is spread after the defaults.
  return prefetchUseFindPaginatedPetsInfinite(
    queryClient,
    {},
    {
      staleTime: 1000,
      getNextPageParam,
    },
  );
}

export function useInfiniteOptionsFactoryTypes() {
  // #203: the factory took no options at all, so it could not be customised.
  const query = useInfiniteQuery(
    findPaginatedPetsInfiniteOptions({}, undefined, { getNextPageParam }),
  );

  // Customising must not degrade what the factory hands to the hook.
  const data: Exact<typeof query.data, InfiniteData<Page> | undefined> = true;
  return data;
}
