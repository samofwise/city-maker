import type { CityMap } from "../types/CityMap";
import {
  buildIndex,
  dist,
  meshFromPoints,
  type CellId,
  type EdgeId,
} from "./mesh";
import { mulberry32 } from "./randomnessHelper";
import {
  DEFAULT_CELL_DATA,
  DEFAULT_EDGE_DATA,
  DEFAULT_VERTEX_DATA,
  type CellData,
  type EdgeData,
  type VertexData,
  type Zone,
} from "./terrain";

export const generateCity = (
  width: number,
  height: number,
  seed = 42
): CityMap => {
  const rng = mulberry32(seed);
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) / 2;

  // ── 1. Create Voronoi mesh ─────────────────────────────────────────────────
  const CELL_COUNT = 80;
  const sites = spiralSites(CELL_COUNT, cx, cy, maxR, rng);
  const mesh = meshFromPoints<VertexData, EdgeData, CellData>(
    sites,
    [0, 0, width, height],
    {
      vertex: { ...DEFAULT_VERTEX_DATA },
      edge: { ...DEFAULT_EDGE_DATA },
      cell: { ...DEFAULT_CELL_DATA },
    }
  );

  // ── 2. Classify cells by distance from center ─────────────────────────────
  const cells = [...mesh.cells.values()];
  const cellDist = new Map<CellId, number>();
  for (const c of cells) {
    cellDist.set(c.id, dist(c.siteX, c.siteY, cx, cy));
  }

  const sorted = cells
    .slice()
    .sort((a, b) => (cellDist.get(a.id) ?? 0) - (cellDist.get(b.id) ?? 0));

  // Closest cell = plaza/market
  const plazaId = sorted[0]!.id;
  // 2nd–5th ring = city core
  const innerCount = Math.floor(CELL_COUNT * 0.22);
  const cityIds = new Set(sorted.slice(1, innerCount + 1).map((c) => c.id));
  // Next ring = mixed city/park
  const midCount = Math.floor(CELL_COUNT * 0.18);
  const midIds = new Set(
    sorted.slice(innerCount + 1, innerCount + midCount + 1).map((c) => c.id)
  );
  // Outer cells: farm / forest based on random
  const outerIds = sorted.slice(innerCount + midCount + 1);

  // Furthest cells = water (border)
  const waterCutoff =
    dist(
      sorted[sorted.length - 1]!.siteX,
      sorted[sorted.length - 1]!.siteY,
      cx,
      cy
    ) * 0.82;
  const waterIds = new Set(
    outerIds
      .filter((c) => (cellDist.get(c.id) ?? 0) > waterCutoff)
      .map((c) => c.id)
  );

  // ── 3. Assign terrain ─────────────────────────────────────────────────────
  mesh.cells.get(plazaId)!.data = {
    terrain: "market",
    zoneId: "plaza",
    density: 0.3,
    withinWalls: true,
  };

  for (const id of cityIds) {
    mesh.cells.get(id)!.data = {
      terrain: rng() < 0.12 ? "park" : "city",
      zoneId: "city-core",
      density: 0.55 + rng() * 0.3,
      withinWalls: true,
    };
  }

  for (const id of midIds) {
    const r = rng();
    mesh.cells.get(id)!.data = {
      terrain: r < 0.25 ? "park" : "city",
      zoneId: r < 0.25 ? "parks" : "city-outer",
      density: 0.3 + rng() * 0.3,
      withinWalls: true,
    };
  }

  for (const c of outerIds) {
    if (waterIds.has(c.id)) {
      mesh.cells.get(c.id)!.data = {
        terrain: "water",
        zoneId: "ocean",
        density: 0,
        withinWalls: false,
      };
    } else {
      const r = rng();
      const terrain = r < 0.45 ? "farm" : r < 0.75 ? "forest" : "empty";
      mesh.cells.get(c.id)!.data = {
        terrain,
        zoneId:
          terrain === "farm"
            ? "farmland"
            : terrain === "forest"
              ? "forest-zone"
              : null,
        density: 0.3 + rng() * 0.5,
        withinWalls: false,
      };
    }
  }

  // ── 4. Mark withinWalls on inner cells ────────────────────────────────────
  for (const id of cityIds) mesh.cells.get(id)!.data.withinWalls = true;

  // ── 5. Place wall along the inner/outer boundary ─────────────────────────
  const outerIdSet = new Set(outerIds.map((c) => c.id));
  outerIdSet.add(plazaId); // safety

  const wallRadius =
    sorted[innerCount + midCount]!.siteX !== undefined
      ? (cellDist.get(sorted[innerCount + midCount]!.id) ?? maxR * 0.6)
      : maxR * 0.6;

  // Wall = edges shared between inner city cells and outer/farm cells
  // OR edges of inner cells that touch the boundary ring
  const midIdSet = new Set(midIds);
  const cityIdSet = new Set([...cityIds, plazaId]);

  for (const [eid, e] of mesh.edges.entries()) {
    const adjCells = mesh.index.edgeCells.get(eid) ?? [];
    if (adjCells.length < 2) continue;
    const ca = adjCells[0]!;
    const cb = adjCells[1]!;
    const innerA = cityIdSet.has(ca) || midIdSet.has(ca);
    const innerB = cityIdSet.has(cb) || midIdSet.has(cb);
    const outerA = outerIdSet.has(ca) || (!innerA && !midIdSet.has(ca));
    const outerB = outerIdSet.has(cb) || (!innerB && !midIdSet.has(cb));

    // Edge crosses inner→outer = wall candidate
    if ((innerA && outerB) || (innerB && outerA)) {
      const va = mesh.vertices.get(e.a)!;
      const vb = mesh.vertices.get(e.b)!;
      const midX = (va.x + vb.x) / 2;
      const midY = (va.y + vb.y) / 2;
      const d = dist(midX, midY, cx, cy);
      if (d < wallRadius * 1.35) {
        e.data = { feature: "wall", width: 3 };
      }
    }
  }

  // ── 6. Carve 2–4 roads from center toward cardinal/diagonal exits ─────────
  const roadAngles = [
    0,
    Math.PI / 2,
    Math.PI,
    (3 * Math.PI) / 2,
    Math.PI / 4,
    (3 * Math.PI) / 4,
  ].slice(0, 3 + Math.floor(rng() * 2));

  for (const angle of roadAngles) {
    // Walk from center outward along the edge closest to this ray
    let currentCellId: CellId = plazaId;
    const visited = new Set<CellId>();

    for (let step = 0; step < 20; step++) {
      visited.add(currentCellId);
      const adjEdges = mesh.index.cellEdges.get(currentCellId) ?? [];
      let bestEid: EdgeId | null = null;
      let bestScore = -Infinity;

      for (const eid of adjEdges) {
        const adjCells = mesh.index.edgeCells.get(eid) ?? [];
        const nextId = adjCells.find((c) => c !== currentCellId);
        if (!nextId || visited.has(nextId)) continue;
        const nc = mesh.cells.get(nextId)!;
        // Score: dot product with desired road direction
        const dx = nc.siteX - cx,
          dy = nc.siteY - cy;
        const score = Math.cos(angle) * dx + Math.sin(angle) * dy;
        if (score > bestScore) {
          bestScore = score;
          bestEid = eid;
        }
      }

      if (!bestEid) break;
      const bestEdge = mesh.edges.get(bestEid)!;
      if (bestEdge.data.feature !== "wall") {
        bestEdge.data = { feature: "road", width: 5 };
      } else {
        // Mark gate vertex where road meets wall
        const va = mesh.vertices.get(bestEdge.a)!;
        const vb = mesh.vertices.get(bestEdge.b)!;
        // The vertex closer to the center line of the road gets the gate
        [va, vb].forEach((v) => {
          v.data = { feature: "gate" };
        });
        bestEdge.data = { feature: "road", width: 5 };
      }

      const adjCells = mesh.index.edgeCells.get(bestEid) ?? [];
      const next = adjCells.find((c) => c !== currentCellId);
      if (!next) break;
      currentCellId = next;
    }
  }

  // ── 7. Add a river (organic winding path from top to bottom or side) ──────
  // Find cells along a winding path from top edge to bottom edge
  const riverAngle = (0.3 + rng() * 0.4) * Math.PI; // mostly top→bottom
  const riverCells = new Set<CellId>();
  let riverCell: CellId | null =
    sorted.find((c) => c.siteY < height * 0.2)?.id ?? null;

  if (riverCell) {
    const riverVisited = new Set<CellId>();
    let cursor: CellId | null = riverCell;
    for (let step = 0; step < 25 && cursor; step++) {
      const cell: CellId = cursor;
      riverVisited.add(cell);
      riverCells.add(cell);
      const adjEdges = mesh.index.cellEdges.get(cell) ?? [];
      let bestEid: EdgeId | null = null;
      let bestScore = -Infinity;

      for (const eid of adjEdges) {
        const e = mesh.edges.get(eid)!;
        if (e.data.feature !== "none") continue; // don't cross roads/walls
        const adjC = mesh.index.edgeCells.get(eid) ?? [];
        const next = adjC.find((c) => c !== cell && !riverVisited.has(c));
        if (!next) continue;
        const nc = mesh.cells.get(next)!;
        const dx = nc.siteX - cx,
          dy = nc.siteY - cy;
        const score =
          Math.cos(riverAngle) * dx +
          Math.sin(riverAngle) * dy +
          (rng() - 0.5) * 60; // add noise for organic path
        if (score > bestScore) {
          bestScore = score;
          bestEid = eid;
        }
      }

      if (!bestEid) break;
      mesh.edges.get(bestEid)!.data = { feature: "river", width: 7 };
      const adjC = mesh.index.edgeCells.get(bestEid) ?? [];
      cursor = adjC.find((c) => c !== cell && !riverVisited.has(c)) ?? null;
    }
    riverCell = cursor;
  }

  // ── 8. Mark bridge vertices where roads cross rivers ─────────────────────
  for (const [, v] of mesh.vertices) {
    const vEdges = mesh.index.vertexEdges.get(v.id) ?? [];
    const hasRoad = vEdges.some(
      (eid) => mesh.edges.get(eid)!.data.feature === "road"
    );
    const hasRiver = vEdges.some(
      (eid) => mesh.edges.get(eid)!.data.feature === "river"
    );
    const hasWall = vEdges.some(
      (eid) => mesh.edges.get(eid)!.data.feature === "wall"
    );

    if (hasRiver && hasRoad) {
      v.data = { feature: "bridge" };
    } else if (hasWall && hasRoad && v.data.feature === "none") {
      v.data = { feature: "gate" };
    } else if (hasWall && !hasRoad && v.data.feature === "none") {
      // Tower at wall corners not intersected by roads
      const wallEdgeCount = vEdges.filter(
        (eid) => mesh.edges.get(eid)!.data.feature === "wall"
      ).length;
      if (wallEdgeCount >= 2) v.data = { feature: "tower" };
    }
  }

  // ── 9. Rebuild index after mutations ─────────────────────────────────────
  mesh.index = buildIndex(mesh.cells, mesh.edges);

  // ── 10. Build zones ───────────────────────────────────────────────────────
  const zones = new Map<string, Zone>();

  const addZone = (
    id: string,
    name: string,
    type: Zone["type"],
    density: number
  ) => {
    zones.set(id, { id, name, type, cellIds: new Set(), density });
  };

  addZone("plaza", "Market Plaza", "city", 0.2);
  addZone("city-core", "City Core", "city", 0.7);
  addZone("city-outer", "Outer District", "city", 0.45);
  addZone("parks", "Parks", "city", 0.1);
  addZone("farmland", "Farmland", "farmland", 0.4);
  addZone("forest-zone", "Forest", "forest", 0.6);
  addZone("ocean", "Ocean", "ocean", 0);

  for (const c of mesh.cells.values()) {
    const zid = c.data.zoneId;
    if (zid && zones.has(zid)) zones.get(zid)!.cellIds.add(c.id);
  }

  return { mesh, zones, width, height };
};



// ── Geometry helpers ──────────────────────────────────────────────────────────

// function lerp(a: number, b: number, t: number) {
//   return a + (b - a) * t;
// }

// /** Point on segment (ax,ay)→(bx,by) closest to (px,py). Returns t ∈ [0,1]. */
// function closestPointOnSegment(
//   px: number, py: number,
//   ax: number, ay: number,
//   bx: number, by: number
// ): number {
//   const dx = bx - ax, dy = by - ay;
//   const lenSq = dx * dx + dy * dy;
//   if (lenSq === 0) return 0;
//   return Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
// }

// /** Minimum distance from point to segment. */
// function distToSegment(
//   px: number, py: number,
//   ax: number, ay: number,
//   bx: number, by: number
// ): number {
//   const t  = closestPointOnSegment(px, py, ax, ay, bx, by);
//   const cx = lerp(ax, bx, t), cy = lerp(ay, by, t);
//   return dist(px, py, cx, cy);
// }

// ── Voronoi seed layout (TownGeneratorOS spiral-rings) ────────────────────────

function spiralSites(
  count: number,
  cx: number,
  cy: number,
  maxR: number,
  rng: () => number
): { x: number; y: number }[] {
  const sa = rng() * Math.PI * 2;
  return Array.from({ length: count }, (_, i) => {
    const a = sa + Math.sqrt(i) * 5;
    const r = i === 0 ? 0 : 30 + i * (3 + rng() * 2);
    return {
      x: Math.max(
        12,
        Math.min(cx * 2 - 12, cx + Math.cos(a) * Math.min(r, maxR * 0.85))
      ),
      y: Math.max(
        12,
        Math.min(cy * 2 - 12, cy + Math.sin(a) * Math.min(r, maxR * 0.85))
      ),
    };
  });
}

// ── Main generator ────────────────────────────────────────────────────────────
