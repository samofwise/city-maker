import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import { generateCity } from "../lib/generate";
import { mapReducer, type MapState, type MapAction } from "../lib/mapState";
import { WIDTH, HEIGHT } from "../components/organisms/MeshView";

const initialState: MapState = {
  city:     generateCity(WIDTH, HEIGHT, 42),
  editMode: false,
  tool:     "select",
  hovered:  null,
  selected: null,
};

const MapCtx = createContext<{
  state:    MapState;
  dispatch: Dispatch<MapAction>;
} | null>(null);

export const MapProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(mapReducer, initialState);
  return <MapCtx.Provider value={{ state, dispatch }}>{children}</MapCtx.Provider>;
};

export const useMap = () => {
  const ctx = useContext(MapCtx);
  if (!ctx) throw new Error("useMap must be used inside MapProvider");
  return ctx;
};
