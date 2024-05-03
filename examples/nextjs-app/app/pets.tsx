'use client'

import { useDefaultServiceFindPets } from "@/openapi/queries";
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export default function Pets() {
  const { data } = useDefaultServiceFindPets({
    limit: 10,
    tags: [],
  });

  return (
    <>
    <h1>Pet List</h1>
      <ul>
        {Array.isArray(data) &&
          data?.map((pet, index) => (
            <li key={`${pet.id}-${index}`}>{pet.name}</li>
          ))}
      </ul>
      <ReactQueryDevtools initialIsOpen={false} />
    </>
  )
}
