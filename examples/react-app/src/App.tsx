import "./App.css";
import {
  useDefaultServiceAddPet,
  useDefaultServiceFindPets,
  UseDefaultServiceFindPetsKeyFn,
  useDefaultServiceGetNotDefined,
  useDefaultServicePostNotDefined,
} from "../openapi/queries";
import { useState } from "react";
import { queryClient } from "./queryClient";
import { SuspenseParent } from "./components/SuspenseParent";

function App() {
  const [tags, _setTags] = useState<string[]>([]);
  const [limit, _setLimit] = useState<number>(10);

  const { data, error, refetch } = useDefaultServiceFindPets({ tags, limit });
  // This is an example of using a hook that has all parameters optional;
  // Here we do not have to pass in an object
  const {} = useDefaultServiceFindPets();

  // This is an example of a query that is not defined in the OpenAPI spec
  // this defaults to any - here we are showing how to override the type
  // Note - this is marked as deprecated in the OpenAPI spec and being passed to the client
  const { data: notDefined } = useDefaultServiceGetNotDefined<undefined>();
  const { mutate: mutateNotDefined } =
    useDefaultServicePostNotDefined<undefined>();

  const { mutate: addPet } = useDefaultServiceAddPet();

  if (error)
    return (
      <div>
        <p>Failed to fetch pets</p>
        <button onClick={() => refetch()}>Retry</button>
      </div>
    );

  return (
    <div className="App">
      <h1>Pet List</h1>
      <ul>
        {data instanceof Array &&
          data?.map((pet, index) => (
            <li key={pet.id + "-" + index}>{pet.name}</li>
          ))}
      </ul>
      <button
        onClick={() => {
          addPet(
            {
              requestBody: { name: "Duggy" },
            },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({
                  queryKey: UseDefaultServiceFindPetsKeyFn(),
                });
                console.log("success");
              },
              onError: (error) => console.error(error),
            }
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
