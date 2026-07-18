import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import { prefetchUseFindPaginatedPetsInfinite } from "../../openapi/queries/prefetch";
import PaginatedPets from "../components/PaginatedPets";

export default async function InfiniteLoaderPage() {
  const queryClient = new QueryClient();

  // Prefetch the first page on the server; the client picks up the cache
  // through HydrationBoundary and continues with fetchNextPage. The
  // clientOptions must match the ones used by useFindPaginatedPetsInfinite
  // so both sides resolve the same query key.
  await prefetchUseFindPaginatedPetsInfinite(queryClient, {
    query: { limit: 10, tags: [] },
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <PaginatedPets />
      </HydrationBoundary>
    </main>
  );
}
