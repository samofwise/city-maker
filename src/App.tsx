import { MapProvider } from "./contexts/MapContext";
import { Home } from "./components/pages/Home";

const App = () => (
  <MapProvider>
    <Home />
  </MapProvider>
);

export default App;
