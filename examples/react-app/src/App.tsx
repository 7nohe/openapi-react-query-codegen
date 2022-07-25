import "./App.css";
import {
  useDefaultClientAddPet,
  useDefaultClientFindPets,
} from "../openapi/queries";

function App() {
  const { data } = useDefaultClientFindPets(
    { tags: [], limit: 10 },
    [],
    {
      onError: (error) => {
        console.error(error);
      },
    }
  );

  const mutation = useDefaultClientAddPet();

  return (
    <div className="App">
      <h1>Pet List</h1>
      <ul>
        {data instanceof Array && data?.map((pet, index) => (
          <li key={pet.id + "-" + index}>{pet.name}</li>
        ))}
      </ul>
      <button
        onClick={() => {
          mutation.mutate(
            {
              requestBody: { name: "Duggy" },
            },
            {
              onSuccess: () => console.log("success"),
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
