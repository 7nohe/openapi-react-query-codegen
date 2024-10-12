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
                  queryKey: UseFindPetsKeyFn({ query: { tags, limit } }),
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
      <div>
        <h1>Suspense Components</h1>
        <SuspenseParent />
      </div>
    </div>
  );
}

export default App;
