import "./App.css";
import {
  useDefaultClientAddPet,
  useDefaultClientFindPets,
  useDefaultClientFindPetsKey,
} from "../openapi/queries";
import { useState } from "react";
import { queryClient } from "./queryClient";

function App() {
  const [tags, _setTags] = useState<string[]>([]);
  const [limit, _setLimit] = useState<number>(10);

  const { data, error, refetch } = useDefaultClientFindPets({ tags, limit });

  const { mutate: addPet } = useDefaultClientAddPet();

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
                  queryKey: [useDefaultClientFindPetsKey],
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
    </div>
  );
}

export default App;
