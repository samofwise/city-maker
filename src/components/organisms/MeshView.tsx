import { useMemo, useRef, useState, type PointerEvent } from "react";
import {
  meshFromPoints,
  moveVertex,
  type Mesh,
  type VertexId,
} from "../../lib/mesh";
import {
  PALETTE,
  DEFAULT_CELL_DATA,
  DEFAULT_EDGE_DATA,
  DEFAULT_VERTEX_DATA,
  type CellData,
  type EdgeData,
  type VertexData,
} from "../../lib/terrain";

export const WIDTH  = 800;
export const HEIGHT = 600;
const SITE_COUNT    = 32;
const BOUNDS: [number, number, number, number] = [0, 0, WIDTH, HEIGHT];

type CityMesh = Mesh<VertexData, EdgeData, CellData>;

// Deterministic PRNG so the mesh is stable across HMR reloads
function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t |= 0; t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const createInitialMesh = (): CityMesh => {
  const rng = mulberry32(1337);
  // Spiral-ish spread so cells near center are denser (like TownGeneratorOS)
  const sites = Array.from({ length: SITE_COUNT }, (_, i) => {
    const a  = rng() * Math.PI * 2;
    const r  = i === 0 ? 0 : 60 + rng() * (WIDTH / 2 - 80);
    return {
      x: Math.max(20, Math.min(WIDTH  - 20, WIDTH  / 2 + Math.cos(a) * r)),
      y: Math.max(20, Math.min(HEIGHT - 20, HEIGHT / 2 + Math.sin(a) * r)),
    };
  });
  return meshFromPoints(sites, BOUNDS, {
    vertex: { ...DEFAULT_VERTEX_DATA },
    edge:   { ...DEFAULT_EDGE_DATA },
    cell:   { ...DEFAULT_CELL_DATA },
  });
};

// Map each terrain type to fill + stroke colours
const TERRAIN_STYLE: Record<
  CellData["terrain"],
  { fill: string; stroke: string }
> = {
  water:  { fill: PALETTE.water,      stroke: PALETTE.waterDark },
  farm:   { fill: PALETTE.farm,       stroke: PALETTE.farmDark  },
  forest: { fill: PALETTE.forest,     stroke: PALETTE.forestDark},
  city:   { fill: PALETTE.city,       stroke: PALETTE.cityDark  },
  market: { fill: PALETTE.market,     stroke: PALETTE.marketDark},
  park:   { fill: PALETTE.park,       stroke: PALETTE.parkDark  },
  empty:  { fill: PALETTE.empty,      stroke: PALETTE.paperDark },
};

// Edge feature colours
const EDGE_STYLE: Record<
  EdgeData["feature"],
  { stroke: string; width: number } | null
> = {
  none:  null,
  road:  { stroke: PALETTE.roadOuter,  width: 3.5 },
  river: { stroke: PALETTE.riverFill,  width: 5   },
  wall:  { stroke: PALETTE.wallStroke, width: 4   },
};

// Vertex feature shapes
const VERTEX_RADIUS: Record<VertexData["feature"], number> = {
  none:   5,
  gate:   7,
  bridge: 6,
  tower:  8,
};

const VERTEX_FILL: Record<VertexData["feature"], string> = {
  none:   PALETTE.text,
  gate:   PALETTE.gate,
  bridge: PALETTE.bridge,
  tower:  PALETTE.tower,
};

// ── Component ──────────────────────────────────────────────────────────────────

export const MeshView = () => {
  const [mesh, setMesh]       = useState<CityMesh>(createInitialMesh);
  const [dragging, setDragging] = useState<VertexId | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const toSvgPoint = (e: PointerEvent<SVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(WIDTH,  ((e.clientX - rect.left) / rect.width)  * WIDTH)),
      y: Math.max(0, Math.min(HEIGHT, ((e.clientY - rect.top)  / rect.height) * HEIGHT)),
    };
  };

  const onPointerDown = (id: VertexId) => (e: PointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(id);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const { x, y } = toSvgPoint(e);
    moveVertex(mesh, dragging, x, y);
    setMesh({ ...mesh });
  };

  const onPointerUp = () => setDragging(null);

  const v = (id: VertexId) => mesh.vertices.get(id)!;

  // Pre-compute points string per cell (memoised; rebuilds only when mesh changes)
  const cellPoints = useMemo(
    () =>
      new Map(
        [...mesh.cells.values()].map((c) => [
          c.id,
          c.vertexIds.map((id) => `${v(id).x},${v(id).y}`).join(" "),
        ])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mesh]
  );

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-3 text-xs text-gray-600">
        {(Object.entries(TERRAIN_STYLE) as [CellData["terrain"], { fill: string }][]).map(
          ([t, s]) => (
            <span key={t} className="flex items-center gap-1 capitalize">
              <span
                className="inline-block h-3 w-3 rounded-sm border border-gray-400"
                style={{ background: s.fill }}
              />
              {t}
            </span>
          )
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full max-w-4xl touch-none rounded border border-gray-300"
        style={{ background: PALETTE.paper }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Cell fills */}
        {[...mesh.cells.values()].map((c) => {
          const style = TERRAIN_STYLE[c.data.terrain];
          return (
            <polygon
              key={c.id}
              points={cellPoints.get(c.id)}
              fill={style.fill}
              stroke={style.stroke}
              strokeWidth={0.8}
            />
          );
        })}

        {/* Edge features */}
        {[...mesh.edges.values()].map((e) => {
          const style = EDGE_STYLE[e.data.feature];
          if (!style) return null;
          const va = v(e.a), vb = v(e.b);
          return (
            <line
              key={e.id}
              x1={va.x} y1={va.y}
              x2={vb.x} y2={vb.y}
              stroke={style.stroke}
              strokeWidth={style.width}
              strokeLinecap="round"
            />
          );
        })}

        {/* Vertices */}
        {[...mesh.vertices.values()].map((vx) => (
          <circle
            key={vx.id}
            cx={vx.x}
            cy={vx.y}
            r={VERTEX_RADIUS[vx.data.feature]}
            fill={dragging === vx.id ? "#dc2626" : VERTEX_FILL[vx.data.feature]}
            stroke="white"
            strokeWidth={1.5}
            className="cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown(vx.id)}
          />
        ))}
      </svg>
    </div>
  );
};
