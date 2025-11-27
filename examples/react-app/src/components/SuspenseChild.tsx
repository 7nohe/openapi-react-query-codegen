import { useFindPetsSuspense } from "../../openapi/queries/suspense";

export const SuspenseChild = () => {
  // useSuspenseQuery enforces throwOnError: true, so errors are thrown and caught by ErrorBoundary
  const { data } = useFindPetsSuspense({
    query: { tags: [], limit: 10 },
  });

  return (
    <ul>
      {data.map((pet) => (
        <li key={pet.id}>{pet.name}</li>
      ))}
    </ul>
  );
};
