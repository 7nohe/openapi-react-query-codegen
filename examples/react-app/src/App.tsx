import "./App.css";
import {
  usePetServiceAddPet,
  usePetServiceFindPetsByStatus,
} from "../openapi/queries";
function App() {
  const { data } = usePetServiceFindPetsByStatus(
    { status: ["available"] },
    ["available"],
    {
      onError: (error) => {
        console.error(error);
      },
    }
  );
  const mutation = usePetServiceAddPet();

  return (
    <div className="App">
      <h1>Pet List</h1>
      <ul>
        {data?.map((pet, index) => (
          <li key={pet.id + "-" + index}>{pet.name}</li>
        ))}
      </ul>
      <button
        onClick={() => {
          mutation.mutate(
            {
              body: { name: "Duggy", photoUrls: ["http://example.com"] },
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
