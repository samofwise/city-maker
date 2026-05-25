import { type CellId, type EdgeId, type VertexId } from "./mesh";

// ── Selection / hover ─────────────────────────────────────────────────────────

export type SelectionType = "cell" | "edge" | "vertex";

export interface Selection {
  type: SelectionType;
  id: CellId | EdgeId | VertexId;
  traceIds?: EdgeId[];
}

// ── UI-only map state ────────────────────────────────────────────────────────

export interface MapState {
  hovered: Selection | null;
  selected: Selection | null;
  activeZoneId: string | null; // zone currently selected for painting
  paintMode: "add" | "remove";
}

export type MapAction =
  | { type: "HOVER"; sel: Selection | null }
  | { type: "SELECT"; sel: Selection | null }
  | { type: "SET_ACTIVE_ZONE"; zoneId: string | null }
  | { type: "SET_PAINT_MODE"; mode: "add" | "remove" };

export function mapReducer(state: MapState, action: MapAction): MapState {
  switch (action.type) {
    case "HOVER":
      return { ...state, hovered: action.sel };

    case "SELECT":
      return { ...state, selected: action.sel };

    case "SET_ACTIVE_ZONE":
      return { ...state, activeZoneId: action.zoneId };

    case "SET_PAINT_MODE":
      return { ...state, paintMode: action.mode };

    default:
      return state;
  }
}
