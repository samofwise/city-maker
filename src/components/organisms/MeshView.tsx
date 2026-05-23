import { useMemo, useRef, useState, type PointerEvent } from "react";
import { moveVertex, type VertexId } from "../../lib/mesh";
import { generateCity, type CityMesh } from "../../lib/generate";
import { CellContent } from "./CellContent";
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

  const vpt = (id: VertexId) => mesh.vertices.get(id)!;

  // Cell outer polygon point strings
  const cellPoints = useMemo(
    () =>
      new Map(
        [...mesh.cells.values()].map((c) => [
          c.id,
          c.vertexIds.map((id) => `${vpt(id).x},${vpt(id).y}`).join(" "),
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
      {/* ── Cell base fills ─────────────────────────────────────────────── */}
      {[...mesh.cells.values()].map((c) => (
        <polygon
          key={c.id}
          points={cellPoints.get(c.id)}
          fill={TERRAIN_FILL[c.data.terrain]}
          stroke={TERRAIN_STROKE[c.data.terrain]}
          strokeWidth={0.7}
        />
      ))}

      {/* ── Cell content (buildings, trees, crops, water ripples) ─────── */}
      {[...mesh.cells.values()].map((c) => (
        <CellContent key={`cc-${c.id}`} cell={c} mesh={mesh} />
      ))}

      {/* ── Rivers (painted below roads/walls so roads cross over) ─────── */}
      {[...mesh.edges.values()]
        .filter((e) => e.data.feature === "river")
        .map((e) => {
          const va = vpt(e.a), vb = vpt(e.b);
          return (
            <g key={e.id}>
              <line
                x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
                stroke={PALETTE.riverEdge}
                strokeWidth={8}
                strokeLinecap="round"
              />
              <line
                x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
                stroke={PALETTE.riverFill}
                strokeWidth={5.5}
                strokeLinecap="round"
              />
            </g>
          );
        })}

      {/* ── Roads (double-stroke TownGeneratorOS style) ─────────────────── */}
      {[...mesh.edges.values()]
        .filter((e) => e.data.feature === "road")
        .map((e) => {
          const va = vpt(e.a), vb = vpt(e.b);
          return (
            <g key={e.id}>
              <line
                x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
                stroke={PALETTE.roadOuter}
                strokeWidth={5}
                strokeLinecap="round"
              />
              <line
                x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
                stroke={PALETTE.roadInner}
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            </g>
          );
        })}

      {/* ── Walls ───────────────────────────────────────────────────────── */}
      {[...mesh.edges.values()]
        .filter((e) => e.data.feature === "wall")
        .map((e) => {
          const va = vpt(e.a), vb = vpt(e.b);
          return (
            <line
              key={e.id}
              x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
              stroke={PALETTE.wallStroke}
              strokeWidth={3.5}
              strokeLinecap="square"
            />
          );
        })}

      {/* ── Vertex features ─────────────────────────────────────────────── */}
      {[...mesh.vertices.values()]
        .filter((v) => v.data.feature !== "none")
        .map((v) => {
          const isGate   = v.data.feature === "gate";
          const isTower  = v.data.feature === "tower";
          const isBridge = v.data.feature === "bridge";
          return (
            <g key={v.id}>
              {(isGate || isTower) && (
                <circle
                  cx={v.x} cy={v.y}
                  r={isTower ? 7 : 5}
                  fill={PALETTE.wallFill}
                  stroke={PALETTE.wallStroke}
                  strokeWidth={1.5}
                />
              )}
              {isBridge && (
                <>
                  <circle cx={v.x} cy={v.y} r={6} fill={PALETTE.bridge} stroke={PALETTE.roadOuter} strokeWidth={1.5} />
                  <line x1={v.x - 4} y1={v.y} x2={v.x + 4} y2={v.y} stroke="white" strokeWidth={1} />
                </>
              )}
            </g>
          );
        })}

      {/* ── Draggable vertex handles ─────────────────────────────────────── */}
      {[...mesh.vertices.values()].map((v) => (
        <circle
          key={`h-${v.id}`}
          cx={v.x} cy={v.y}
          r={dragging === v.id ? 7 : 4}
          fill={dragging === v.id ? "#dc2626" : PALETTE.text}
          opacity={dragging === v.id ? 1 : 0.35}
          stroke="white"
          strokeWidth={1}
          className="cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown(v.id)}
        />
      ))}
    </svg>
  );
};
