import { MapProvider } from "./contexts/MapContext";
import { EditingProvider } from "./contexts/EditingContext";
import { Home } from "./components/pages/Home";

const App = () => (
  <MapProvider>
    <EditingProvider>
      <Home />
    </EditingProvider>
  </MapProvider>
);

export default App;
