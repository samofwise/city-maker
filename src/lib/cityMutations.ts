import type { CityMap } from "../types/CityMap";
import type { CellId, EdgeId, VertexId } from "./mesh";
import type {
  CellData,
  EdgeData,
  VertexData,
  TerrainType,
  Zone,
  ZoneType,
} from "./terrain";

let _zoneCounter = 100;

const bumpMesh = (city: CityMap): CityMap => ({
  ...city,
  mesh: { ...city.mesh },
});

const TERRAIN_FOR_ZONE: Record<ZoneType, TerrainType> = {
  ocean:    "water",
  lake:     "water",
  forest:   "forest",
  farmland: "farm",
  city:     "city",
};

// ── Cell / edge / vertex updates ────────────────────────────────────────────

export function updateCell(
  city: CityMap,
  id: CellId,
  patch: Partial<CellData>
): CityMap {
  const cell = city.mesh.cells.get(id);
  if (!cell) return city;
  cell.data = { ...cell.data, ...patch };
  return bumpMesh(city);
}

export function updateEdge(
  city: CityMap,
  id: EdgeId,
  patch: Partial<EdgeData>
): CityMap {
  const edge = city.mesh.edges.get(id);
  if (!edge) return city;
  edge.data = { ...edge.data, ...patch };
  return bumpMesh(city);
}

export function updateVertex(
  city: CityMap,
  id: VertexId,
  patch: Partial<VertexData>
): CityMap {
  const vertex = city.mesh.vertices.get(id);
  if (!vertex) return city;
  vertex.data = { ...vertex.data, ...patch };
  return bumpMesh(city);
}

export function moveVertex(
  city: CityMap,
  id: VertexId,
  x: number,
  y: number
): CityMap {
  const vertex = city.mesh.vertices.get(id);
  if (!vertex) return city;
  vertex.x = x;
  vertex.y = y;
  return bumpMesh(city);
}

// ── Zone CRUD ───────────────────────────────────────────────────────────────

export function createZone(
  city: CityMap,
  name: string,
  zoneType: ZoneType,
  density: number
): { city: CityMap; zoneId: string } {
  const zoneId = `zone-${++_zoneCounter}`;
  const zone: Zone = {
    id: zoneId,
    name,
    type: zoneType,
    cellIds: new Set(),
    density,
  };
  const zones = new Map(city.zones);
  zones.set(zoneId, zone);
  return { city: { ...city, zones }, zoneId };
}

export function updateZoneRecord(
  city: CityMap,
  zoneId: string,
  patch: Partial<Omit<Zone, "id" | "cellIds">>
): CityMap {
  const zones = new Map(city.zones);
  const z = zones.get(zoneId);
  if (!z) return city;
  zones.set(zoneId, { ...z, ...patch });
  return { ...city, zones };
}

export function deleteZone(city: CityMap, zoneId: string): CityMap {
  const zones = new Map(city.zones);
  const z = zones.get(zoneId);
  if (!z) return city;
  const mesh = city.mesh;
  for (const cellId of z.cellIds) {
    const cell = mesh.cells.get(cellId as CellId);
    if (cell) cell.data = { ...cell.data, zoneId: null };
  }
  zones.delete(zoneId);
  return { ...city, mesh: { ...mesh }, zones };
}

// ── Paint ───────────────────────────────────────────────────────────────────

export function paintCell(
  city: CityMap,
  id: CellId,
  zoneId: string
): CityMap {
  const mesh = city.mesh;
  const cell = mesh.cells.get(id);
  const zones = new Map(city.zones);
  const zone = zones.get(zoneId);
  if (!cell || !zone) return city;

  const oldZoneId = cell.data.zoneId;
  if (oldZoneId && oldZoneId !== zoneId && zones.has(oldZoneId)) {
    const oz = zones.get(oldZoneId)!;
    const newCells = new Set(oz.cellIds);
    newCells.delete(id);
    zones.set(oldZoneId, { ...oz, cellIds: newCells });
  }

  cell.data = {
    ...cell.data,
    terrain: TERRAIN_FOR_ZONE[zone.type],
    zoneId,
    density: zone.density,
  };

  const newCells = new Set(zone.cellIds);
  newCells.add(id);
  zones.set(zoneId, { ...zone, cellIds: newCells });

  return { ...city, mesh: { ...mesh }, zones };
}

export function unpaintCell(city: CityMap, id: CellId): CityMap {
  const mesh = city.mesh;
  const cell = mesh.cells.get(id);
  if (!cell?.data.zoneId) return city;
  const zones = new Map(city.zones);
  const oldZoneId = cell.data.zoneId;
  if (zones.has(oldZoneId)) {
    const oz = zones.get(oldZoneId)!;
    const newCells = new Set(oz.cellIds);
    newCells.delete(id);
    zones.set(oldZoneId, { ...oz, cellIds: newCells });
  }
  cell.data = { ...cell.data, terrain: "empty", zoneId: null };
  return { ...city, mesh: { ...mesh }, zones };
}
