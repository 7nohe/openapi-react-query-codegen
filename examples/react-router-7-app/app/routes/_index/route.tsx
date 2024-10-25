import { useState } from "react";

import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import {
  UseFindPetsKeyFn,
  useAddPet,
  useFindPets,
} from "../../../openapi/queries";
import { prefetchUseFindPets } from "../../../openapi/queries/prefetch";
import "./App.css";
import type * as Route from "./+types.route"

export async function loader({ params }: Route.LoaderArgs) {
  const queryClient = new QueryClient();

  await prefetchUseFindPets(queryClient, {
    query: { tags: [], limit: 10 },
  });

  return { dehydratedState: dehydrate(queryClient) };
}

function Pets() {
  const queryClient = new QueryClient();
  const { data, error, refetch } = useFindPets({
    query: { tags: [], limit: 10 },
  });

  console.log(data);

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
                  queryKey: UseFindPetsKeyFn({
                    query: { tags: [], limit: 10 },
                  }),
                });
                console.log("success");
              },
              onError: (error) => {
                console.log(error.message);
                setErrorText(`Error: ${error.message}`);
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

export default function Index({ loaderData }: Route.ComponentProps) {
  const { dehydratedState } = loaderData;
  return (
    <HydrationBoundary state={dehydratedState}>
      <Pets />
    </HydrationBoundary>
  );
}
