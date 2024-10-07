import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import Link from "next/link";
import { prefetchUseFindPets } from "../openapi/queries/prefetch";
import Pets from "./components/Pets";
import { client } from "./providers";

export default async function Home() {
  const queryClient = new QueryClient();

  await prefetchUseFindPets(queryClient, {
    query: { tags: [], limit: 10 },
    client: client,
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Pets />
      </HydrationBoundary>
      <Link href="/infinite-loader" className="underline">
        Go to Infinite Loader &rarr;
      </Link>
    </main>
  );
}
