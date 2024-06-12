import { useFindPetsSuspense } from "../../openapi/queries/suspense";

export const SuspenseChild = () => {
  const { data } = useFindPetsSuspense({ tags: [], limit: 10 });

  if (!Array.isArray(data.data)) {
    return <div>Error!</div>;
  }

  return (
    <ul>
      {data?.data.map((pet, index) => (
        <li key={pet.id}>{pet.name}</li>
      ))}
    </ul>
  );
};
