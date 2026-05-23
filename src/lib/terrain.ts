// ── Terrain / edge / vertex feature types ────────────────────────────────────

export type TerrainType =
  | "water"
  | "farm"
  | "forest"
  | "city"
  | "market"
  | "park"
  | "empty";

export type EdgeFeature = "none" | "road" | "river" | "wall";
export type VertexFeature = "none" | "gate" | "bridge" | "tower";

export interface CellData {
  terrain: TerrainType;
  zoneId: string | null;
  density: number;       // 0–1: building density / tree density / crop density
  withinWalls: boolean;
}

export interface EdgeData {
  feature: EdgeFeature;
  width: number;         // clearance (each side): road≈6, river≈8, wall≈4
}

export interface VertexData {
  feature: VertexFeature;
}

export const DEFAULT_CELL_DATA: CellData = {
  terrain: "empty",
  zoneId: null,
  density: 0.5,
  withinWalls: false,
};

export const DEFAULT_EDGE_DATA: EdgeData = {
  feature: "none",
  width: 0,
};

export const DEFAULT_VERTEX_DATA: VertexData = {
  feature: "none",
};

// ── Zones ─────────────────────────────────────────────────────────────────────

export type ZoneType = "ocean" | "lake" | "forest" | "farmland" | "city";

export interface Zone {
  id: string;
  name: string;
  type: ZoneType;
  cellIds: Set<string>;
  density: number;       // 0–1 default density for cells in this zone
}

// ── Palette (TownGeneratorOS parchment aesthetic) ────────────────────────────

export const PALETTE = {
  // Base
  paper:    "#f5e9c8",
  paperDark:"#e8d4a0",

  // Terrain fills
  water:    "#8ab4cc",
  waterDark:"#6496b4",
  farm:     "#c8b87a",
  farmDark: "#a89650",
  forest:   "#6e9658",
  forestDark:"#4e7040",
  city:     "#d4b896",
  cityDark: "#b89670",
  market:   "#e8d090",
  marketDark:"#c8b060",
  park:     "#90b878",
  parkDark: "#6a9058",
  empty:    "#e8d8b8",

  // Edges
  roadOuter:   "#8a7a5a",
  roadInner:   "#e8d4a8",
  riverFill:   "#6496b4",
  riverEdge:   "#4a7a9a",
  wallStroke:  "#4a3a2a",
  wallFill:    "#6a5a4a",

  // Features
  gate:        "#3a2a1a",
  tower:       "#4a3a2a",
  bridge:      "#8a7050",

  // UI
  hover:       "rgba(255,220,80,0.35)",
  selected:    "rgba(255,160,20,0.5)",
  text:        "#2a1a0a",
} as const;

// Clearance widths (half-width, in world-units, inset per edge side)
export const CLEARANCE: Record<EdgeFeature, number> = {
  none:  0,
  road:  5,
  river: 7,
  wall:  3,
};
