import './App.css'
import { usePetsServiceListPets } from '../openapi/queries'
function App() {
  const { data } = usePetsServiceListPets();

  return (
    <div className="App">
      <h1>Pet List</h1>
      <ul>
        {data instanceof Array && data.map(pet => (<li key={pet.id}>{pet.name}</li>))}
      </ul>
    </div>
  )
}

export default App
