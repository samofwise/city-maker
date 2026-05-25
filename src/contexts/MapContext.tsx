import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import { mapReducer, type MapState, type MapAction } from "../lib/mapState";

const initialState: MapState = {
  hovered:      null,
  selected:     null,
  activeZoneId: null,
  paintMode:    "add",
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
