import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query'
import { prefetchUseDefaultServiceFindPets } from "@/openapi/queries/prefetch";
import Pets from "./pets";

export default async function Home() {
  const queryClient = new QueryClient()

  await prefetchUseDefaultServiceFindPets(queryClient, {
    limit: 10,
    tags: [],
  })

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <HydrationBoundary state={dehydrate(queryClient)}>
      <Pets />
    </HydrationBoundary>
    </main>
  );
}
