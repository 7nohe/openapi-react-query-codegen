import PaginatedPets from "../components/PaginatedPets";

export default async function InfiniteLoaderPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <PaginatedPets />
    </main>
  );
}
