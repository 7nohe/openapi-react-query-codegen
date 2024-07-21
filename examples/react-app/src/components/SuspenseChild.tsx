import { useFindPetsSuspense } from "../../openapi/queries/suspense";

export const SuspenseChild = () => {
  const { data, error } = useFindPetsSuspense({
    query: { tags: [], limit: 10 },
  });
  console.log({ error });
  if (!Array.isArray(data)) {
    return <div>Error!</div>;
  }

  return (
    <ul>
      {data?.map((pet) => (
        <li key={pet.id}>{pet.name}</li>
      ))}
    </ul>
  );
};
