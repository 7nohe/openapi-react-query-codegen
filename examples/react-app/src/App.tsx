import "./App.css";
import {
  usePetServiceAddPet,
  usePetServiceFindPetsByStatus,
} from "../openapi/queries";
function App() {
  const { data } = usePetServiceFindPetsByStatus({ status: ["available"] });
  const mutation = usePetServiceAddPet();

  return (
    <div className="App">
      <h1>Pet List</h1>
      <ul>
        {data instanceof Array &&
          data.map((pet, index) => (
            <li key={pet.id + "-" + index}>{pet.name}</li>
          ))}
      </ul>
      <button
        onClick={() => {
          mutation.mutate(
            [{ name: "Duggy", photoUrls: ["http://example.com"] }],
            {
              onSuccess: () => console.log("success"),
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
