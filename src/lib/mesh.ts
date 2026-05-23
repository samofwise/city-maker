import { Delaunay } from "d3-delaunay";

export type VertexId = string & { readonly __brand: "VertexId" };
export type EdgeId = string & { readonly __brand: "EdgeId" };
export type CellId = string & { readonly __brand: "CellId" };

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
  vertexIds: VertexId[];
  data: C;
}

export interface Mesh<V = unknown, E = unknown, C = unknown> {
  vertices: Map<VertexId, Vertex<V>>;
  edges: Map<EdgeId, Edge<E>>;
  cells: Map<CellId, Cell<C>>;
}

export function meshFromPoints<V, E, C>(
  sites: Array<{ x: number; y: number }>,
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

  const key = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
  const vertexByPos = new Map<string, VertexId>();
  const getOrCreateVertex = (x: number, y: number): VertexId => {
    const k = key(x, y);
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

  sites.forEach((_, i) => {
    const poly = voronoi.cellPolygon(i);
    if (!poly) return;
    const ring = poly.slice(0, -1);
    const vIds = ring.map(([x, y]) => getOrCreateVertex(x, y));

    const cellId = `c${i}` as CellId;
    cells.set(cellId, {
      id: cellId,
      vertexIds: vIds,
      data: structuredClone(defaults.cell),
    });

    for (let j = 0; j < vIds.length; j++) {
      const a = vIds[j];
      const b = vIds[(j + 1) % vIds.length];
      const k = edgeKey(a, b);
      if (!edgeByKey.has(k)) {
        const eid = `e${edges.size}` as EdgeId;
        edges.set(eid, {
          id: eid,
          a,
          b,
          data: structuredClone(defaults.edge),
        });
        edgeByKey.set(k, eid);
      }
    }
  });

  return { vertices, edges, cells };
}

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
