import { Delaunay } from "d3-delaunay";
import { insetPolygon, type Pt } from "./geometry";
import { CLEARANCE, type EdgeData } from "./terrain";

// ── Branded IDs ───────────────────────────────────────────────────────────────

export type VertexId = string & { readonly __brand: "VertexId" };
export type EdgeId = string & { readonly __brand: "EdgeId" };
export type CellId = string & { readonly __brand: "CellId" };

// ── Core element types ────────────────────────────────────────────────────────

export interface Vertex<V = unknown> {
  id: VertexId;
  x: number;
  y: number;
  data: V;
}

export interface Edge<E = unknown> {
  id: EdgeId;
  a: VertexId;
  b: VertexId;
  data: E;
}

export interface Cell<C = unknown> {
  id: CellId;
  vertexIds: VertexId[]; // ordered polygon ring
  siteX: number; // original Voronoi seed x
  siteY: number; // original Voronoi seed y
  data: C;
}

// ── Adjacency index (computed once, kept in sync on vertex moves) ─────────────

export interface MeshIndex {
  cellEdges: Map<CellId, EdgeId[]>; // edges bounding each cell (ordered)
  edgeCells: Map<EdgeId, CellId[]>; // 1 or 2 cells per edge
  vertexEdges: Map<VertexId, EdgeId[]>; // edges meeting at vertex
  vertexCells: Map<VertexId, CellId[]>; // cells meeting at vertex
}

// ── Mesh ──────────────────────────────────────────────────────────────────────

export interface Mesh<V = unknown, E = unknown, C = unknown> {
  vertices: Map<VertexId, Vertex<V>>;
  edges: Map<EdgeId, Edge<E>>;
  cells: Map<CellId, Cell<C>>;
  index: MeshIndex;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function meshFromPoints<V, E, C>(
  sites: { x: number; y: number }[],
  bounds: [number, number, number, number],
  defaults: { vertex: V; edge: E; cell: C }
): Mesh<V, E, C> {
  const delaunay = Delaunay.from(
    sites,
    (p) => p.x,
    (p) => p.y
  );
  const voronoi = delaunay.voronoi(bounds);

  const vertices = new Map<VertexId, Vertex<V>>();
  const edges = new Map<EdgeId, Edge<E>>();
  const cells = new Map<CellId, Cell<C>>();

  const posKey = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
  const vertexByPos = new Map<string, VertexId>();

  const getOrCreateVertex = (x: number, y: number): VertexId => {
    const k = posKey(x, y);
    const existing = vertexByPos.get(k);
    if (existing) return existing;
    const id = `v${vertices.size}` as VertexId;
    vertices.set(id, { id, x, y, data: structuredClone(defaults.vertex) });
    vertexByPos.set(k, id);
    return id;
  };

  const edgeKey = (a: VertexId, b: VertexId) =>
    a < b ? `${a}|${b}` : `${b}|${a}`;
  const edgeByKey = new Map<string, EdgeId>();

  sites.forEach((site, i) => {
    const poly = voronoi.cellPolygon(i);
    if (!poly) return;
    const ring = poly.slice(0, -1); // drop closing duplicate
    const vIds = ring.map(([x, y]) => getOrCreateVertex(x, y));

    const cellId = `c${i}` as CellId;
    cells.set(cellId, {
      id: cellId,
      vertexIds: vIds,
      siteX: site.x,
      siteY: site.y,
      data: structuredClone(defaults.cell),
    });

    for (let j = 0; j < vIds.length; j++) {
      const a = vIds[j]!;
      const b = vIds[(j + 1) % vIds.length]!;
      const k = edgeKey(a, b);
      if (!edgeByKey.has(k)) {
        const eid = `e${edges.size}` as EdgeId;
        edges.set(eid, { id: eid, a, b, data: structuredClone(defaults.edge) });
        edgeByKey.set(k, eid);
      }
    }
  });

  return { vertices, edges, cells, index: buildIndex(cells, edges) };
}

// ── Index ─────────────────────────────────────────────────────────────────────

export function buildIndex<E, C>(
  cells: Map<CellId, Cell<C>>,
  edges: Map<EdgeId, Edge<E>>
): MeshIndex {
  const cellEdges = new Map<CellId, EdgeId[]>();
  const edgeCells = new Map<EdgeId, CellId[]>();
  const vertexEdges = new Map<VertexId, EdgeId[]>();
  const vertexCells = new Map<VertexId, CellId[]>();

  const edgeKey = (a: VertexId, b: VertexId) =>
    a < b ? `${a}|${b}` : `${b}|${a}`;
  const keyToEdge = new Map<string, EdgeId>();
  for (const e of edges.values()) keyToEdge.set(edgeKey(e.a, e.b), e.id);

  for (const cell of cells.values()) {
    const { id, vertexIds: vIds } = cell;
    const cEdges: EdgeId[] = [];

    for (let j = 0; j < vIds.length; j++) {
      const a = vIds[j]!;
      const b = vIds[(j + 1) % vIds.length]!;
      const eid = keyToEdge.get(edgeKey(a, b));
      if (eid) {
        cEdges.push(eid);
        const ec = edgeCells.get(eid) ?? [];
        if (!ec.includes(id)) ec.push(id);
        edgeCells.set(eid, ec);
      }
    }
    cellEdges.set(id, cEdges);

    for (const vid of vIds) {
      const ve = vertexEdges.get(vid) ?? [];
      for (const eid of cEdges) {
        const e = edges.get(eid)!;
        if ((e.a === vid || e.b === vid) && !ve.includes(eid)) ve.push(eid);
      }
      vertexEdges.set(vid, ve);

      const vc = vertexCells.get(vid) ?? [];
      if (!vc.includes(id)) vc.push(id);
      vertexCells.set(vid, vc);
    }
  }

  return { cellEdges, edgeCells, vertexEdges, vertexCells };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function moveVertex(
  mesh: Mesh,
  id: VertexId,
  x: number,
  y: number
): void {
  const v = mesh.vertices.get(id);
  if (v) {
    v.x = x;
    v.y = y;
  }
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

/** Returns the centroid of a cell polygon. */
export function cellCentroid<C>(
  cell: Cell<C>,
  vertices: Map<VertexId, Vertex<unknown>>
): { x: number; y: number } {
  let sx = 0,
    sy = 0;
  for (const vid of cell.vertexIds) {
    const v = vertices.get(vid)!;
    sx += v.x;
    sy += v.y;
  }
  return { x: sx / cell.vertexIds.length, y: sy / cell.vertexIds.length };
}

/** Distance between two points. */
export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

/**
 * Returns the cell whose site is closest to (x, y). Used to seed terrain
 * assignment by radius.
 */
export function closestCell<V, E, C>(
  mesh: Mesh<V, E, C>,
  x: number,
  y: number
): CellId | null {
  let best: CellId | null = null;
  let bestD = Infinity;
  for (const cell of mesh.cells.values()) {
    const d = dist(x, y, cell.siteX, cell.siteY);
    if (d < bestD) {
      bestD = d;
      best = cell.id;
    }
  }
  return best;
}

/**
 * Walks connected edges of the same EdgeFeature type starting from `startEdge`.
 * Used to select "whole road" / "whole river" / "whole wall".
 */
export function traceFeature<V, E extends { feature: string }, C>(
  mesh: Mesh<V, E, C>,
  startEdge: EdgeId
): EdgeId[] {
  const start = mesh.edges.get(startEdge);
  if (!start) return [];
  const targetFeature = start.data.feature;
  if (targetFeature === "none") return [startEdge];

  const result = new Set<EdgeId>([startEdge]);
  const queue: VertexId[] = [start.a, start.b];

  while (queue.length) {
    const vid = queue.pop()!;
    const neighbors = mesh.index.vertexEdges.get(vid) ?? [];
    for (const eid of neighbors) {
      if (result.has(eid)) continue;
      const e = mesh.edges.get(eid)!;
      if (e.data.feature === targetFeature) {
        result.add(eid);
        const other = e.a === vid ? e.b : e.a;
        queue.push(other);
      }
    }
  }

  return [...result];
}

/**
 * Computes the inset polygon for a cell based on adjacent edge features. Edges
 * that border a road/river/wall are shrunk inward by the CLEARANCE amount.
 * Returns an array of {x,y} points defining the inset polygon.
 */
export function computeCellInset<V, C>(
  cell: Cell<C>,
  mesh: Mesh<V, EdgeData, C>
): Pt[] {
  const vIds = cell.vertexIds;
  const n = vIds.length;
  const pts = vIds.map((id) => {
    const v = mesh.vertices.get(id)!;
    return { x: v.x, y: v.y };
  });

  // For each edge i→(i+1), find its clearance
  const edgeKey = (a: VertexId, b: VertexId) =>
    a < b ? `${a}|${b}` : `${b}|${a}`;
  const keyToEdge = new Map<string, EdgeData>();
  for (const e of mesh.edges.values()) {
    keyToEdge.set(edgeKey(e.a, e.b), e.data);
  }

  const insets: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = vIds[i]!,
      b = vIds[(i + 1) % n]!;
    const edata = keyToEdge.get(edgeKey(a, b));
    insets.push(edata ? CLEARANCE[edata.feature] : 0);
  }

  if (insets.every((v) => v === 0)) return pts;
  return insetPolygon(pts, insets);
}
