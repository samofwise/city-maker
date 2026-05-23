import { type CellId, type EdgeId, type VertexId } from "./mesh";
import type { GeneratedCity } from "./generate";
import type { TerrainType, ZoneType, Zone } from "./terrain";

// ── Selection / hover ─────────────────────────────────────────────────────────

export type SelectionType = "cell" | "edge" | "vertex";

export interface Selection {
  type: SelectionType;
  id:   CellId | EdgeId | VertexId;
  traceIds?: EdgeId[];
}

// ── Edit tool modes ───────────────────────────────────────────────────────────

export type EditTool = "select" | "paint" | "vertex";

// ── Full map state ────────────────────────────────────────────────────────────

export interface MapState {
  city:            GeneratedCity;
  editMode:        boolean;
  tool:            EditTool;
  hovered:         Selection | null;
  selected:        Selection | null;
  activeZoneId:    string | null; // zone currently selected for painting
  paintMode:       "add" | "remove";
}

export type MapAction =
  | { type: "SET_CITY";          city: GeneratedCity }
  | { type: "TOGGLE_EDIT" }
  | { type: "SET_TOOL";          tool: EditTool }
  | { type: "HOVER";             sel: Selection | null }
  | { type: "SELECT";            sel: Selection | null }
  | { type: "SET_ACTIVE_ZONE";   zoneId: string | null }
  | { type: "SET_PAINT_MODE";    mode: "add" | "remove" }
  | { type: "CREATE_ZONE";       name: string; zoneType: ZoneType; terrain: TerrainType; density: number }
  | { type: "UPDATE_ZONE";       zoneId: string; patch: Partial<Omit<Zone, "id" | "cellIds">> }
  | { type: "DELETE_ZONE";       zoneId: string }
  | { type: "PAINT_CELL";        id: CellId; zoneId: string | null }
  | { type: "UNPAINT_CELL";      id: CellId }
  | { type: "UPDATE_CELL";       id: CellId;   patch: Partial<import("./terrain").CellData> }
  | { type: "UPDATE_EDGE";       id: EdgeId;   patch: Partial<import("./terrain").EdgeData> }
  | { type: "UPDATE_VERTEX";     id: VertexId; patch: Partial<import("./terrain").VertexData> }
  | { type: "MOVE_VERTEX";       id: VertexId; x: number; y: number };

let _zoneCounter = 100;

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

    case "SET_ACTIVE_ZONE":
      return { ...state, activeZoneId: action.zoneId };

    case "SET_PAINT_MODE":
      return { ...state, paintMode: action.mode };

    // ── Zone CRUD ─────────────────────────────────────────────────────────

    case "CREATE_ZONE": {
      const id = `zone-${++_zoneCounter}`;
      const zone: Zone = {
        id,
        name:     action.name,
        type:     action.zoneType,
        cellIds:  new Set(),
        density:  action.density,
      };
      const zones = new Map(state.city.zones);
      zones.set(id, zone);
      return {
        ...state,
        city: { ...state.city, zones },
        activeZoneId: id,
      };
    }

    case "UPDATE_ZONE": {
      const zones = new Map(state.city.zones);
      const z = zones.get(action.zoneId);
      if (!z) return state;
      zones.set(action.zoneId, { ...z, ...action.patch });
      return { ...state, city: { ...state.city, zones } };
    }

    case "DELETE_ZONE": {
      const zones = new Map(state.city.zones);
      const z = zones.get(action.zoneId);
      if (!z) return state;
      // Unassign all cells in this zone
      const mesh = state.city.mesh;
      for (const cellId of z.cellIds) {
        const cell = mesh.cells.get(cellId);
        if (cell) cell.data = { ...cell.data, zoneId: null };
      }
      zones.delete(action.zoneId);
      return {
        ...state,
        city: { ...state.city, mesh: { ...mesh }, zones },
        activeZoneId: state.activeZoneId === action.zoneId ? null : state.activeZoneId,
      };
    }

    // ── Paint ─────────────────────────────────────────────────────────────

    case "PAINT_CELL": {
      if (!action.zoneId) return state;
      const mesh  = state.city.mesh;
      const cell  = mesh.cells.get(action.id);
      const zones = new Map(state.city.zones);
      const zone  = zones.get(action.zoneId);
      if (!cell || !zone) return state;

      // Remove from old zone
      const oldZoneId = cell.data.zoneId;
      if (oldZoneId && oldZoneId !== action.zoneId && zones.has(oldZoneId)) {
        const oz = zones.get(oldZoneId)!;
        const newCells = new Set(oz.cellIds);
        newCells.delete(action.id);
        zones.set(oldZoneId, { ...oz, cellIds: newCells });
      }

      // Terrain for this zone type
      const terrainForZone: Record<ZoneType, TerrainType> = {
        ocean:     "water",
        lake:      "water",
        forest:    "forest",
        farmland:  "farm",
        city:      "city",
      };

      cell.data = {
        ...cell.data,
        terrain: terrainForZone[zone.type],
        zoneId:  action.zoneId,
        density: zone.density,
      };

      const newCells = new Set(zone.cellIds);
      newCells.add(action.id);
      zones.set(action.zoneId, { ...zone, cellIds: newCells });

      return { ...state, city: { ...state.city, mesh: { ...mesh }, zones } };
    }

    case "UNPAINT_CELL": {
      const mesh  = state.city.mesh;
      const cell  = mesh.cells.get(action.id);
      if (!cell || !cell.data.zoneId) return state;
      const zones    = new Map(state.city.zones);
      const oldZoneId = cell.data.zoneId;
      if (zones.has(oldZoneId)) {
        const oz = zones.get(oldZoneId)!;
        const newCells = new Set(oz.cellIds);
        newCells.delete(action.id);
        zones.set(oldZoneId, { ...oz, cellIds: newCells });
      }
      cell.data = { ...cell.data, terrain: "empty", zoneId: null };
      return { ...state, city: { ...state.city, mesh: { ...mesh }, zones } };
    }

    // ── Element updates ───────────────────────────────────────────────────

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
      const mesh   = state.city.mesh;
      const vertex = mesh.vertices.get(action.id);
      if (!vertex) return state;
      vertex.data = { ...vertex.data, ...action.patch };
      return { ...state, city: { ...state.city, mesh: { ...mesh } } };
    }

    case "MOVE_VERTEX": {
      const mesh   = state.city.mesh;
      const vertex = mesh.vertices.get(action.id);
      if (!vertex) return state;
      vertex.x = action.x;
      vertex.y = action.y;
      return { ...state, city: { ...state.city, mesh: { ...mesh } } };
    }

    default:
      return state;
  }
}
