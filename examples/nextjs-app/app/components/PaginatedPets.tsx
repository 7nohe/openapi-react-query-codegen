"use client";

import { useFindPaginatedPetsInfinite } from "@/openapi/queries/infiniteQueries";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import React from "react";

export default function PaginatedPets() {
  const { data, fetchNextPage } = useFindPaginatedPetsInfinite({
    query: {
      limit: 10,
      tags: [],
    },
  });

  return (
    <>
      <h1>Pet List with Pagination</h1>
      <ul>
        {data?.pages.map((group, i) => (
          <React.Fragment key={group?.pets?.at(0)?.id}>
            {group?.pets?.map((pet) => (
              <li key={pet.id}>{pet.name}</li>
            ))}
          </React.Fragment>
        ))}
      </ul>
      {data?.pages.at(-1)?.nextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          className="bg-blue-500 px-4 py-2 text-white mt-4"
        >
          Load More
        </button>
      )}
      <ReactQueryDevtools initialIsOpen={false} />
    </>
  );
}
