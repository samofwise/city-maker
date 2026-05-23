import { type CellId, type EdgeId, type VertexId } from "./mesh";
import type { GeneratedCity } from "./generate";

// ── Selection / hover ─────────────────────────────────────────────────────────

export type SelectionType = "cell" | "edge" | "vertex";

export interface Selection {
  type: SelectionType;
  id:   CellId | EdgeId | VertexId;
  /** For edges with a feature, the full connected set */
  traceIds?: EdgeId[];
}

// ── Edit tool modes ───────────────────────────────────────────────────────────

export type EditTool = "select" | "paint" | "vertex";

// ── Full map state ────────────────────────────────────────────────────────────

export interface MapState {
  city:     GeneratedCity;
  editMode: boolean;
  tool:     EditTool;
  hovered:  Selection | null;
  selected: Selection | null;
}

export type MapAction =
  | { type: "SET_CITY";     city: GeneratedCity }
  | { type: "TOGGLE_EDIT" }
  | { type: "SET_TOOL";     tool: EditTool }
  | { type: "HOVER";        sel: Selection | null }
  | { type: "SELECT";       sel: Selection | null }
  | { type: "UPDATE_CELL";  id: CellId;   patch: Partial<import("./terrain").CellData> }
  | { type: "UPDATE_EDGE";  id: EdgeId;   patch: Partial<import("./terrain").EdgeData> }
  | { type: "UPDATE_VERTEX";id: VertexId; patch: Partial<import("./terrain").VertexData> }
  | { type: "MOVE_VERTEX";  id: VertexId; x: number; y: number }
  | { type: "PAINT_CELL";   id: CellId;   zoneId: string; terrain: import("./terrain").TerrainType };

export function mapReducer(state: MapState, action: MapAction): MapState {
  switch (action.type) {
    case "SET_CITY":
      return { ...state, city: action.city };

    case "TOGGLE_EDIT":
      return { ...state, editMode: !state.editMode, hovered: null, selected: null };

    case "SET_TOOL":
      return { ...state, tool: action.tool, hovered: null, selected: null };

    case "HOVER":
      return { ...state, hovered: action.sel };

    case "SELECT":
      return { ...state, selected: action.sel };

    case "UPDATE_CELL": {
      const mesh = state.city.mesh;
      const cell = mesh.cells.get(action.id);
      if (!cell) return state;
      cell.data = { ...cell.data, ...action.patch };
      return { ...state, city: { ...state.city, mesh: { ...mesh } } };
    }

    case "UPDATE_EDGE": {
      const mesh = state.city.mesh;
      const edge = mesh.edges.get(action.id);
      if (!edge) return state;
      edge.data = { ...edge.data, ...action.patch };
      return { ...state, city: { ...state.city, mesh: { ...mesh } } };
    }

    case "UPDATE_VERTEX": {
      const mesh = state.city.mesh;
      const vertex = mesh.vertices.get(action.id);
      if (!vertex) return state;
      vertex.data = { ...vertex.data, ...action.patch };
      return { ...state, city: { ...state.city, mesh: { ...mesh } } };
    }

    case "MOVE_VERTEX": {
      const mesh = state.city.mesh;
      const vertex = mesh.vertices.get(action.id);
      if (!vertex) return state;
      vertex.x = action.x;
      vertex.y = action.y;
      return { ...state, city: { ...state.city, mesh: { ...mesh } } };
    }

    case "PAINT_CELL": {
      const mesh = state.city.mesh;
      const cell = mesh.cells.get(action.id);
      if (!cell) return state;
      cell.data = { ...cell.data, terrain: action.terrain, zoneId: action.zoneId };
      // Update zone cellIds
      const zones = new Map(state.city.zones);
      // Remove from old zone
      const oldZoneId = cell.data.zoneId;
      if (oldZoneId && zones.has(oldZoneId)) {
        const z = zones.get(oldZoneId)!;
        const newCells = new Set(z.cellIds);
        newCells.delete(action.id);
        zones.set(oldZoneId, { ...z, cellIds: newCells });
      }
      // Add to new zone
      if (action.zoneId && zones.has(action.zoneId)) {
        const z = zones.get(action.zoneId)!;
        zones.set(action.zoneId, { ...z, cellIds: new Set([...z.cellIds, action.id]) });
      }
      return { ...state, city: { ...state.city, mesh: { ...mesh }, zones } };
    }

    default:
      return state;
  }
}
