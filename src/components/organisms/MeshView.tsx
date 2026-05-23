import { useMemo, useRef, useState, type PointerEvent } from "react";
import { moveVertex, type VertexId } from "../../lib/mesh";
import { generateCity, type CityMesh } from "../../lib/generate";
import {
  PALETTE,
  type CellData,
  type EdgeData,
  type VertexData,
} from "../../lib/terrain";

export const WIDTH  = 800;
export const HEIGHT = 600;

const TERRAIN_FILL: Record<CellData["terrain"], string> = {
  water:  PALETTE.water,
  farm:   PALETTE.farm,
  forest: PALETTE.forest,
  city:   PALETTE.city,
  market: PALETTE.market,
  park:   PALETTE.park,
  empty:  PALETTE.empty,
};

const TERRAIN_STROKE: Record<CellData["terrain"], string> = {
  water:  PALETTE.waterDark,
  farm:   PALETTE.farmDark,
  forest: PALETTE.forestDark,
  city:   PALETTE.cityDark,
  market: PALETTE.marketDark,
  park:   PALETTE.parkDark,
  empty:  PALETTE.paperDark,
};

const EDGE_STROKE: Record<EdgeData["feature"], string | null> = {
  none:  null,
  road:  PALETTE.roadOuter,
  river: PALETTE.riverFill,
  wall:  PALETTE.wallStroke,
};

const EDGE_WIDTH: Record<EdgeData["feature"], number> = {
  none: 0,
  road: 4,
  river: 6,
  wall: 3.5,
};

const VERTEX_FILL: Record<VertexData["feature"], string> = {
  none:   "transparent",
  gate:   PALETTE.gate,
  bridge: PALETTE.bridge,
  tower:  PALETTE.tower,
};

const VERTEX_R: Record<VertexData["feature"], number> = {
  none:   0,
  gate:   5,
  bridge: 5,
  tower:  6,
};

// ── Component ──────────────────────────────────────────────────────────────────

export const MeshView = () => {
  const [{ mesh }, setCity] = useState(() => generateCity(WIDTH, HEIGHT, 42));
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
    setCity((c) => ({ ...c, mesh: { ...mesh } }));
  };

  const onPointerUp = () => setDragging(null);

  const v = (id: VertexId) => mesh.vertices.get(id)!;

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
      {[...mesh.cells.values()].map((c) => (
        <polygon
          key={c.id}
          points={cellPoints.get(c.id)}
          fill={TERRAIN_FILL[c.data.terrain]}
          stroke={TERRAIN_STROKE[c.data.terrain]}
          strokeWidth={0.8}
        />
      ))}

      {/* Edge features (rivers rendered before roads, roads before walls) */}
      {(["river", "road", "wall"] as EdgeData["feature"][]).map((layer) =>
        [...mesh.edges.values()]
          .filter((e) => e.data.feature === layer)
          .map((e) => {
            const va = v(e.a), vb = v(e.b);
            return (
              <line
                key={e.id}
                x1={va.x} y1={va.y}
                x2={vb.x} y2={vb.y}
                stroke={EDGE_STROKE[layer]!}
                strokeWidth={EDGE_WIDTH[layer]}
                strokeLinecap="round"
              />
            );
          })
      )}

      {/* Road inner highlight (double-stroke technique from TownGeneratorOS) */}
      {[...mesh.edges.values()]
        .filter((e) => e.data.feature === "road")
        .map((e) => {
          const va = v(e.a), vb = v(e.b);
          return (
            <line
              key={`${e.id}-inner`}
              x1={va.x} y1={va.y}
              x2={vb.x} y2={vb.y}
              stroke={PALETTE.roadInner}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          );
        })}

      {/* Vertex features (gates, bridges, towers) */}
      {[...mesh.vertices.values()]
        .filter((vx) => vx.data.feature !== "none")
        .map((vx) => (
          <circle
            key={vx.id}
            cx={vx.x}
            cy={vx.y}
            r={VERTEX_R[vx.data.feature]}
            fill={VERTEX_FILL[vx.data.feature]}
            stroke={PALETTE.wallStroke}
            strokeWidth={1.5}
          />
        ))}

      {/* Draggable vertices (shown as small dots, active while dragging = red) */}
      {[...mesh.vertices.values()].map((vx) => (
        <circle
          key={`drag-${vx.id}`}
          cx={vx.x}
          cy={vx.y}
          r={dragging === vx.id ? 6 : 3.5}
          fill={dragging === vx.id ? "#dc2626" : PALETTE.text}
          opacity={dragging === vx.id ? 1 : 0.4}
          stroke="white"
          strokeWidth={1}
          className="cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown(vx.id)}
        />
      ))}
    </svg>
  );
};
