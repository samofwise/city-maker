import { getPercentValue } from "~/helpers/valueHelpers";
import type { Direction, GenerationConfig } from "~/models/GenerationConfig";
import type { CityMap } from "../types/CityMap";
import {
  buildIndex,
  dist,
  lloydRelax,
  meshFromPoints,
  optimizeJunctions,
  type CellId,
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

const COMPLEXITY_MAP = {
  1: 60,
  2: 120,
  3: 180,
  4: 240,
};

const SQRT_HALF = Math.SQRT1_2;
const DIRECTION_VECTORS: Record<Direction, { x: number; y: number }> = {
  north: { x: 0, y: -1 },
  "north-east": { x: SQRT_HALF, y: -SQRT_HALF },
  east: { x: 1, y: 0 },
  "south-east": { x: SQRT_HALF, y: SQRT_HALF },
  south: { x: 0, y: 1 },
  "south-west": { x: -SQRT_HALF, y: SQRT_HALF },
  west: { x: -1, y: 0 },
  "north-west": { x: -SQRT_HALF, y: -SQRT_HALF },
};

export const generateCity = (
  width: number,
  height: number,
  seed = 42
): CityMap => {
  const config: GenerationConfig = {
    coastline: { direction: "west", separatedFromCity: false },
    forest: { direction: "south-east", separatedFromCity: true },
  };

  const rng = mulberry32(seed);
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.max(width, height) / 2;

  // ── 1. Create Voronoi mesh ─────────────────────────────────────────────────
  // TownGeneratorOS pattern: over-generate sites (8× the kept count) so the
  // cells we end up keeping have proper buffer neighbours instead of extending
  // to the canvas corners. Then apply Lloyd's relaxation to even them out.
  const COMPLEXITY = 2;
  const TOTAL_CELLS = COMPLEXITY_MAP[COMPLEXITY];
  const bounds: [number, number, number, number] = [0, 0, width, height];

  const rawSites = spiralSites(TOTAL_CELLS, cx, cy, maxR, rng);

  // Pass 1: global Lloyd relax — evens out the spiral so cell areas are uniform
  // and the Voronoi has well-formed neighbour structure throughout.
  let sites = lloydRelax(rawSites, bounds, 7);

  // Identify which site indices will become city cells (plaza + inner + mid
  // rings) by distance from center on the relaxed positions. We pre-compute
  // this BEFORE building the mesh so we can target a second Lloyd pass at
  // just these sites, which evens out the city patches and pulls the city
  // boundary toward a smooth, near-circular shape (TownGeneratorOS achieves
  // similar smoothness by spiral-seeding + relaxation; a targeted pass tightens
  // it further along the wall line, which is the part the user sees).
  const innerCount = Math.floor(TOTAL_CELLS * 0.1);
  const midCount = Math.floor(TOTAL_CELLS * 0.21);
  const cityCellCount = 1 + innerCount + midCount;

  const indicesByDist = Array.from({ length: TOTAL_CELLS }, (_, i) => i).sort(
    (a, b) =>
      dist(sites[a]!.x, sites[a]!.y, cx, cy) -
      dist(sites[b]!.x, sites[b]!.y, cx, cy)
  );
  const cityIndices = indicesByDist.slice(0, cityCellCount);

  // Pass 2: targeted Lloyd relax on city sites + immediate transition ring.
  // Relaxing the ring just outside the city too removes the irregular outer
  // neighbours that were forcing city boundary cells into spiky shapes — the
  // ring acts like a smooth "cushion" the city packs against. Iterations are
  // higher than the global pass because we want the city patch outline to
  // converge to a near-circular shape (TownGeneratorOS achieves smooth city
  // boundaries via spiral-seeding + heavy relaxation in `Model.hx:99-129`;
  // applying a second focused pass tightens it further).
  const cityPlusRingCount = Math.min(
    TOTAL_CELLS,
    Math.floor(cityCellCount * 1.6)
  );
  const cityPlusRingIndices = indicesByDist.slice(0, cityPlusRingCount);
  sites = lloydRelax(sites, bounds, 6, cityPlusRingIndices);

  // Pass 3: a final tight relax on just the city sites — now that they sit
  // inside a regularised neighbourhood the centroids land closer to the
  // geometric center of each cell, producing more equiangular city patches
  // and a smoother wall ring.
  sites = lloydRelax(sites, bounds, 12, cityIndices);

  const mesh = meshFromPoints<VertexData, EdgeData, CellData>(sites, bounds, {
    vertex: { ...DEFAULT_VERTEX_DATA },
    edge: { ...DEFAULT_EDGE_DATA },
    cell: { ...DEFAULT_CELL_DATA },
  });

  // ── 2. Classify cells by distance from center ─────────────────────────────
  const cellDist = new Map<CellId, number>();
  for (const c of mesh.cells.values()) {
    const distance = dist(c.siteX, c.siteY, cx, cy);
    cellDist.set(c.id, distance);
    c.distanceFromCenter = distance;
  }

  // Merge near-duplicate vertices (TownGen `optimizeJunctions`). Sites fill a
  // disc of radius maxR, so the expected cell area is π·maxR² / TOTAL_CELLS,
  // giving an average cell radius of maxR / √TOTAL_CELLS. We merge vertices
  // closer than ~18% of that — small enough to leave real edges intact, big
  // enough to clean up Voronoi sliver junctions.
  const avgCellRadius = maxR / Math.sqrt(TOTAL_CELLS);
  optimizeJunctions(mesh, avgCellRadius * 0.5);

  const sorted = [...mesh.cells.values()].sort(
    (a, b) => (cellDist.get(a.id) ?? 0) - (cellDist.get(b.id) ?? 0)
  );

  // Closest cell = plaza/market
  const plazaId = sorted[0]!.id;

  // ── Coastline ocean mask ──────────────────────────────────────────────────
  // Project each cell's position (relative to center) onto the coastline
  // direction. Cells past the cutoff become ocean. With `separatedFromCity`
  // the cutoff sits outside the wall ring (ocean is purely beyond the city).
  // Without it, the cutoff reaches into the inner rings so the coast nibbles
  // into the city — making it read as a coastal town.
  const innerMaxRadius = cellDist.get(sorted[innerCount]!.id) ?? maxR * 0.45;
  const midMaxRadius =
    cellDist.get(sorted[innerCount + midCount]!.id) ?? maxR * 0.6;

  const oceanIds = new Set<CellId>();
  if (config.coastline) {
    const dirVec = DIRECTION_VECTORS[config.coastline.direction];
    const cutoff = config.coastline.separatedFromCity
      ? midMaxRadius * 1.15
      : innerMaxRadius * 0.9;
    for (const c of mesh.cells.values()) {
      const dx = c.siteX - cx;
      const dy = c.siteY - cy;
      const proj = dx * dirVec.x + dy * dirVec.y;
      if (proj > cutoff) oceanIds.add(c.id);
    }
    oceanIds.delete(plazaId); // plaza always survives
  }

  // 2nd–5th ring = city core (ocean cells removed so the coast eats inward)
  const cityIds = new Set(
    sorted
      .slice(0, innerCount + 1)
      .filter((c) => !oceanIds.has(c.id))
      .map((c) => c.id)
  );
  // Next ring = mixed city/park
  const midIds = new Set(
    sorted
      .slice(innerCount + 1, innerCount + midCount + 1)
      .filter((c) => !oceanIds.has(c.id))
      .map((c) => c.id)
  );
  // Outer cells: farm / forest based on random
  const outerIds = sorted
    .slice(innerCount + midCount + 1)
    .filter((c) => !oceanIds.has(c.id));

  // ── Forest direction mask ─────────────────────────────────────────────────
  // Same projection trick as the coast, but forests never override city/mid
  // or ocean. `separatedFromCity` pushes the cutoff further out so there is
  // a wider grass collar between the city wall and the tree line.
  const forestIds = new Set<CellId>();
  if (config.forest) {
    const dirVec = DIRECTION_VECTORS[config.forest.direction];
    const cutoff = config.forest.separatedFromCity
      ? midMaxRadius * 1.7
      : midMaxRadius * 1.05;
    for (const c of mesh.cells.values()) {
      if (
        c.id === plazaId ||
        cityIds.has(c.id) ||
        midIds.has(c.id) ||
        oceanIds.has(c.id)
      )
        continue;
      const dx = c.siteX - cx;
      const dy = c.siteY - cy;
      const proj = dx * dirVec.x + dy * dirVec.y;
      if (proj > cutoff) forestIds.add(c.id);
    }
  }

  // Furthest cells = water (border)
  // const waterCutoff =
  //   dist(
  //     sorted[sorted.length - 1]!.siteX,
  //     sorted[sorted.length - 1]!.siteY,
  //     cx,
  //     cy
  //   ) * 0.82;
  // const waterIds = new Set(
  //   outerIds
  //     .filter((c) => (cellDist.get(c.id) ?? 0) > waterCutoff)
  //     .map((c) => c.id)
  // );

  // ── 3. Assign terrain ─────────────────────────────────────────────────────
  // Density gradient inside the walls: dense at the plaza, looser as you
  // approach the city edge. The plaza itself is a low-density "open square"
  // so the buildingGen leaves room for it to read as a public space.
  const innerSet = new Set([plazaId, ...cityIds, ...midIds]);
  const innerMaxDist = Math.max(
    ...[...innerSet].map((id) => cellDist.get(id) ?? 0)
  );

  // Plaza is rendered TownGen-style: a single Market patch with a centroid
  // feature (statue/fountain). Keep density low so CityCell treats it that way.
  mesh.cells.get(plazaId)!.data = {
    terrain: "city",
    zoneId: "plaza",
    density: 0.18,
    withinWalls: true,
  };

  const INNER_DENSITY_RANGE = { min: 0.7, max: 1 };

  for (const id of cityIds) {
    if (id === plazaId) continue; // plaza handled above
    const t = (cellDist.get(id) ?? 0) / (innerMaxDist || 1);
    // t≈0 near plaza (dense, "slum/craftsmen"), t≈1 at the wall (sparser).
    const density = 0.78 - t * 0.28 + (rng() - 0.5) * 0.1;
    mesh.cells.get(id)!.data = {
      terrain: "city",
      zoneId: "city-core",
      density: getPercentValue(INNER_DENSITY_RANGE, density),
      withinWalls: true,
    };
  }

  const OUTER_DENSITY_RANGE = { min: 0.1, max: 0.5 };

  for (const id of midIds) {
    // Outer city ring — slightly sparser, more patriciate-like.
    const density = 0.4 + (rng() - 0.5) * 0.2;
    mesh.cells.get(id)!.data = {
      terrain: "city",
      zoneId: "city-outer",
      density: getPercentValue(OUTER_DENSITY_RANGE, density),
      withinWalls: true,
    };
  }

  // Outside walls — the layout reads outward in bands:
  // grass collar → farms (near gates) → forest → water (rim).
  // Distance-from-walls drives the band; gate-adjacency boosts farmland.
  const gateVertexIds = new Set<string>();
  // (Gates are placed in the road step; we'll classify outer cells AFTER
  // walls/roads run. For now, label everything outside as a placeholder so
  // generic CellData stays sane; the real assignment happens in Step 8.)
  for (const c of outerIds) {
    mesh.cells.get(c.id)!.data = {
      terrain: "grass",
      zoneId: "grassland",
      density: 0.3,
      withinWalls: false,
    };
  }

  // // Furthest cells get marked as water up front so roads/river can avoid them.
  // for (const id of waterIds) {
  //   mesh.cells.get(id)!.data = {
  //     terrain: "water",
  //     zoneId: "ocean",
  //     density: 0,
  //     withinWalls: false,
  //   };
  // }
  // (Placeholder set; real gate-aware outer assignment runs after roads.)
  void gateVertexIds;

  // ── 4. Mark withinWalls on inner cells ────────────────────────────────────
  for (const id of cityIds) mesh.cells.get(id)!.data.withinWalls = true;

  // ── 5. Place wall along the inner/outer boundary ─────────────────────────
  // Plaza is an inner patch — it must NOT appear in outerIdSet, otherwise
  // the wall-placement test below counts plaza↔city-core edges as
  // inner↔outer and wraps the plaza in a wall.
  const outerIdSet = new Set(outerIds.map((c) => c.id));

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
    // The sea is its own boundary — no wall along the coastline.
    if (oceanIds.has(ca) || oceanIds.has(cb)) continue;
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

  // // ── 6. Carve 2–4 roads from center toward cardinal/diagonal exits ─────────
  // const roadAngles = [
  //   0,
  //   Math.PI / 2,
  //   Math.PI,
  //   (3 * Math.PI) / 2,
  //   Math.PI / 4,
  //   (3 * Math.PI) / 4,
  // ].slice(0, 3 + Math.floor(rng() * 2));

  // for (const angle of roadAngles) {
  //   // Walk from center outward along the edge closest to this ray
  //   let currentCellId: CellId = plazaId;
  //   const visited = new Set<CellId>();

  //   for (let step = 0; step < 20; step++) {
  //     visited.add(currentCellId);
  //     const adjEdges = mesh.index.cellEdges.get(currentCellId) ?? [];
  //     let bestEid: EdgeId | null = null;
  //     let bestScore = -Infinity;

  //     for (const eid of adjEdges) {
  //       const adjCells = mesh.index.edgeCells.get(eid) ?? [];
  //       const nextId = adjCells.find((c) => c !== currentCellId);
  //       if (!nextId || visited.has(nextId)) continue;
  //       const nc = mesh.cells.get(nextId)!;
  //       // Score: dot product with desired road direction
  //       const dx = nc.siteX - cx,
  //         dy = nc.siteY - cy;
  //       const score = Math.cos(angle) * dx + Math.sin(angle) * dy;
  //       if (score > bestScore) {
  //         bestScore = score;
  //         bestEid = eid;
  //       }
  //     }

  //     if (!bestEid) break;
  //     const bestEdge = mesh.edges.get(bestEid)!;
  //     if (bestEdge.data.feature !== "wall") {
  //       bestEdge.data = { feature: "road", width: 5 };
  //     } else {
  //       // Mark gate vertex where road meets wall
  //       const va = mesh.vertices.get(bestEdge.a)!;
  //       const vb = mesh.vertices.get(bestEdge.b)!;
  //       // The vertex closer to the center line of the road gets the gate
  //       [va, vb].forEach((v) => {
  //         v.data = { feature: "gate" };
  //       });
  //       bestEdge.data = { feature: "road", width: 5 };
  //     }

  //     const adjCells = mesh.index.edgeCells.get(bestEid) ?? [];
  //     const next = adjCells.find((c) => c !== currentCellId);
  //     if (!next) break;
  //     currentCellId = next;
  //   }
  // }

  // // ── 7. Add a river (organic winding path from top to bottom or side) ──────
  // // Find cells along a winding path from top edge to bottom edge
  // const riverAngle = (0.3 + rng() * 0.4) * Math.PI; // mostly top→bottom
  // const riverCells = new Set<CellId>();
  // let riverCell: CellId | null =
  //   sorted.find((c) => c.siteY < height * 0.2)?.id ?? null;

  // if (riverCell) {
  //   const riverVisited = new Set<CellId>();
  //   let cursor: CellId | null = riverCell;
  //   for (let step = 0; step < 25 && cursor; step++) {
  //     const cell: CellId = cursor;
  //     riverVisited.add(cell);
  //     riverCells.add(cell);
  //     const adjEdges = mesh.index.cellEdges.get(cell) ?? [];
  //     let bestEid: EdgeId | null = null;
  //     let bestScore = -Infinity;

  //     for (const eid of adjEdges) {
  //       const e = mesh.edges.get(eid)!;
  //       if (e.data.feature !== "none") continue; // don't cross roads/walls
  //       const adjC = mesh.index.edgeCells.get(eid) ?? [];
  //       const next = adjC.find((c) => c !== cell && !riverVisited.has(c));
  //       if (!next) continue;
  //       const nc = mesh.cells.get(next)!;
  //       const dx = nc.siteX - cx,
  //         dy = nc.siteY - cy;
  //       const score =
  //         Math.cos(riverAngle) * dx +
  //         Math.sin(riverAngle) * dy +
  //         (rng() - 0.5) * 60; // add noise for organic path
  //       if (score > bestScore) {
  //         bestScore = score;
  //         bestEid = eid;
  //       }
  //     }

  //     if (!bestEid) break;
  //     mesh.edges.get(bestEid)!.data = { feature: "river", width: 7 };
  //     const adjC = mesh.index.edgeCells.get(bestEid) ?? [];
  //     cursor = adjC.find((c) => c !== cell && !riverVisited.has(c)) ?? null;
  //   }
  //   riverCell = cursor;
  // }

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

  // ── 9. Outer-cell reclassification (gate-aware) ───────────────────────────
  // Now that roads/gates are placed, paint a more realistic countryside band:
  // close to gates → farms (people farm near city access). Further away →
  // forest. Anything not in those buckets stays grass (transition collar).
  const gatePositions: { x: number; y: number }[] = [];
  for (const v of mesh.vertices.values()) {
    if (v.data.feature === "gate") gatePositions.push({ x: v.x, y: v.y });
  }
  const distToNearestGate = (px: number, py: number): number => {
    if (gatePositions.length === 0) return Infinity;
    let best = Infinity;
    for (const g of gatePositions) {
      const d = dist(px, py, g.x, g.y);
      if (d < best) best = d;
    }
    return best;
  };
  const farmRadius = maxR * 0.35;

  for (const c of outerIds) {
    // if (waterIds.has(c.id)) continue; // water stays water
    const gd = distToNearestGate(c.siteX, c.siteY);
    const r = rng();
    if (gd < farmRadius && r < 0.7) {
      mesh.cells.get(c.id)!.data = {
        terrain: "farm",
        zoneId: "farmland",
        density: 0.35 + rng() * 0.3,
        withinWalls: false,
      };
    } else {
      mesh.cells.get(c.id)!.data = {
        terrain: "grass",
        zoneId: "grassland",
        density: 0.3 + rng() * 0.2,
        withinWalls: false,
      };
    }
  }

  // ── 10. Apply forest direction overrides ─────────────────────────────────
  for (const id of forestIds) {
    mesh.cells.get(id)!.data = {
      terrain: "forest",
      zoneId: "forest-zone",
      density: 0.5 + rng() * 0.3,
      withinWalls: false,
    };
  }

  // ── 11. Apply coastline ocean overrides ───────────────────────────────────
  for (const id of oceanIds) {
    mesh.cells.get(id)!.data = {
      terrain: "water",
      zoneId: "ocean",
      density: 0,
      withinWalls: false,
    };
  }

  // ── 12. Rebuild index after mutations ─────────────────────────────────────
  mesh.index = buildIndex(mesh.cells, mesh.edges);

  // ── 13. Build zones ───────────────────────────────────────────────────────
  const zones = new Map<string, Zone>();

  const addZone = (
    id: string,
    name: string,
    type: Zone["type"],
    density: number
  ) => {
    zones.set(id, { id, name, type, cellIds: new Set(), density });
  };

  addZone("plaza", "Plaza", "city", 0.18);
  addZone("city-core", "City Core", "city", 0.65);
  addZone("city-outer", "Outer District", "city", 0.4);
  addZone("grassland", "Grassland", "city", 0.3);
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

/**
 * Sunflower-spiral seed placement (port of TownGeneratorOS `Model.hx:99-105`).
 * Angle step `sqrt(i) * 5` is the Fermat-spiral phyllotaxis growth rate. Radial
 * step is self-tuned so the outermost site lands at ~`maxR`.
 */
function spiralSites(
  count: number,
  cx: number,
  cy: number,
  maxR: number,
  rng: () => number
): { x: number; y: number }[] {
  const sa = rng() * Math.PI * 2;
  // Outermost site should sit at ~maxR. With r = base + i * (step + rand*step),
  // mean(r) at i=count-1 ≈ base + count * 1.5 * step → solve for step.
  const base = 100;
  const radialStep = (maxR - base) / (count * 1.5);
  return Array.from({ length: count }, (_, i) => {
    const a = sa + Math.sqrt(i) * 5;
    const r = i === 0 ? 0 : base + i * (radialStep + rng() * radialStep);
    const clamped = Math.min(r, maxR * 0.98);
    return {
      x: Math.max(2, Math.min(cx * 2 - 2, cx + Math.cos(a) * clamped)),
      y: Math.max(2, Math.min(cy * 2 - 2, cy + Math.sin(a) * clamped)),
    };
  });
}

// ── Main generator ────────────────────────────────────────────────────────────
