import "./App.css";
import { useState } from "react";

import { createClient } from "@hey-api/client-fetch";
import {
  UseFindPetsKeyFn,
  useAddPet,
  useFindPets,
  useGetNotDefined,
  usePostNotDefined,
} from "../openapi/queries";
import { SuspenseParent } from "./components/SuspenseParent";
import { queryClient } from "./queryClient";

function App() {
  createClient({ baseUrl: "http://localhost:4010" });

  const [tags, _setTags] = useState<string[]>([]);
  const [limit, _setLimit] = useState<number>(10);

  const { data, error, refetch } = useFindPets({ query: { tags, limit } });
  // This is an example of using a hook that has all parameters optional;
  // Here we do not have to pass in an object
  const { data: _ } = useFindPets();

  // This is an example of a query that is not defined in the OpenAPI spec
  // this defaults to any - here we are showing how to override the type
  // Note - this is marked as deprecated in the OpenAPI spec and being passed to the client
  const { data: notDefined } = useGetNotDefined<undefined>();
  const { mutate: mutateNotDefined } = usePostNotDefined<undefined>();

  const { mutate: addPet } = useAddPet();

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
      <ul>
        {Array.isArray(data) &&
          data?.map((pet, index) => (
            <li key={`${pet.id}-${index}`}>{pet.name}</li>
          ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          addPet(
            {
              body: { name: "Duggy" },
            },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({
                  queryKey: UseFindPetsKeyFn({ query: { tags, limit } }),
                });
                console.log("success");
              },
              onError: (error) => console.error(error),
            },
          );
        }}
      >
        Create a pet
      </button>
      <div>
        <h1>Suspense Components</h1>
        <SuspenseParent />
      </div>
    </div>
  );
}

export default App;
