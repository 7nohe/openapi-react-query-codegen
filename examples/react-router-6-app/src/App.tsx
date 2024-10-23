import "./App.css";
import { useState } from "react";

import type { Options } from "@hey-api/client-axios";
import type { QueryClient } from "@tanstack/react-query";
import { type LoaderFunctionArgs, useLoaderData } from "react-router-dom";
import { UseFindPetsKeyFn, useAddPet } from "../openapi/queries";
import { ensureUseFindPetsData } from "../openapi/queries/ensureQueryData";
import { useFindPetsSuspense } from "../openapi/queries/suspense";
import type { FindPetsData } from "../openapi/requests/types.gen";
import { queryClient } from "./queryClient";

export const loader =
  (queryClient: QueryClient) => async (_: LoaderFunctionArgs) => {
    const queryParameters: Options<FindPetsData, true> = {
      query: { tags: [], limit: 10 },
    };

    await ensureUseFindPetsData(queryClient, queryParameters);
    return queryParameters;
  };

export function Compoment() {
  const queryParameters = useLoaderData() as Awaited<
    ReturnType<ReturnType<typeof loader>>
  >;

  const { data, error, refetch } = useFindPetsSuspense(queryParameters);

  const { mutate: addPet, isError } = useAddPet();

  const [text, setText] = useState<string>("");
  const [errorText, setErrorText] = useState<string>();

  if (error)
    return (
      <div>
        <p>Failed to fetch pets</p>
        <button type="button" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );

  return (
    <div className="App">
      <h1>Pet List</h1>
      <input
        type="text"
        value={text}
        placeholder="Type pet name"
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        onClick={() => {
          addPet(
            {
              body: { name: text },
            },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({
                  queryKey: UseFindPetsKeyFn(queryParameters),
                });
                console.log("success");
              },
              onError: (error) => {
                console.log(error.response);
                setErrorText(`Error: ${error.response?.data.message}`);
              },
            },
          );
        }}
      >
        Create a pet
      </button>
      {isError && (
        <p
          style={{
            color: "red",
          }}
        >
          {errorText}
        </p>
      )}
      <ul>
        {Array.isArray(data) &&
          data?.map((pet, index) => (
            <li key={`${pet.id}-${index}`}>{pet.name}</li>
          ))}
      </ul>
    </div>
  );
}
