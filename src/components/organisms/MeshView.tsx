import { useCallback, useMemo, useRef, type PointerEvent } from "react";
import { traceFeature, type CellId, type EdgeId, type VertexId } from "../../lib/mesh";
import { CellContent } from "./CellContent";
import { useMap } from "../../contexts/MapContext";
import { PALETTE, type CellData, type EdgeData, type VertexData } from "../../lib/terrain";

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
  const { state, dispatch } = useMap();
  const { city: { mesh }, editMode, tool, hovered, selected } = state;
  const draggingRef  = useRef<VertexId | null>(null);
  const paintingRef  = useRef(false);
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

  // ── Paint cell (defined first; used by hover and click) ───────────────────

  const paintCell = useCallback((id: CellId) => {
    if (!editMode || tool !== "paint") return;
    const { activeZoneId, paintMode } = state;
    if (paintMode === "remove") {
      dispatch({ type: "UNPAINT_CELL", id });
    } else if (activeZoneId) {
      dispatch({ type: "PAINT_CELL", id, zoneId: activeZoneId });
    }
  }, [editMode, tool, state, dispatch]);

  // ── Hover helpers ──────────────────────────────────────────────────────────

  const hoverCell = useCallback((id: CellId) => {
    if (!editMode || tool === "vertex") return;
    dispatch({ type: "HOVER", sel: { type: "cell", id } });
    // Drag-paint: paint as pointer moves over cells while button is down
    if (tool === "paint" && paintingRef.current) paintCell(id);
  }, [editMode, tool, dispatch, paintCell]);

  const hoverEdge = useCallback((id: EdgeId) => {
    if (!editMode || tool === "vertex") return;
    const e = mesh.edges.get(id);
    if (!e) return;
    if (e.data.feature !== "none") {
      const traceIds = traceFeature(mesh, id);
      dispatch({ type: "HOVER", sel: { type: "edge", id, traceIds } });
    } else {
      dispatch({ type: "HOVER", sel: { type: "edge", id } });
    }
  }, [editMode, tool, mesh, dispatch]);

  const hoverVertex = useCallback((id: VertexId) => {
    if (!editMode) return;
    dispatch({ type: "HOVER", sel: { type: "vertex", id } });
  }, [editMode, dispatch]);

  const clearHover = useCallback(() => {
    if (editMode) dispatch({ type: "HOVER", sel: null });
  }, [editMode, dispatch]);

  // ── Click / select ─────────────────────────────────────────────────────────

  const clickCell = useCallback((id: CellId) => {
    if (!editMode) return;
    if (tool === "select") {
      dispatch({ type: "SELECT", sel: { type: "cell", id } });
    }
    if (tool === "paint") {
      paintingRef.current = true;
      paintCell(id);
    }
  }, [editMode, tool, dispatch, paintCell]);

  const clickEdge = useCallback((id: EdgeId) => {
    if (!editMode || tool !== "select") return;
    const e = mesh.edges.get(id);
    if (!e) return;
    const traceIds = e.data.feature !== "none" ? traceFeature(mesh, id) : undefined;
    dispatch({ type: "SELECT", sel: { type: "edge", id, traceIds } });
  }, [editMode, tool, mesh, dispatch]);

  const clickVertex = useCallback((id: VertexId) => {
    if (!editMode || tool !== "select") return;
    dispatch({ type: "SELECT", sel: { type: "vertex", id } });
  }, [editMode, tool, dispatch]);

  // ── Vertex drag (vertex tool) ──────────────────────────────────────────────

  const onVertexPointerDown = useCallback((id: VertexId) => (e: PointerEvent<SVGCircleElement>) => {
    if (!editMode || tool !== "vertex") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = id;
  }, [editMode, tool]);

  const onSvgPointerMove = useCallback((e: PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    const { x, y } = toSvgPoint(e);
    dispatch({ type: "MOVE_VERTEX", id: draggingRef.current, x, y });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const onSvgPointerUp = useCallback(() => {
    draggingRef.current = null;
    paintingRef.current = false;
  }, []);

  // ── Computed vertex positions ──────────────────────────────────────────────

  const vpt = useCallback((id: VertexId) => mesh.vertices.get(id)!, [mesh]);

  const cellPoints = useMemo(
    () =>
      new Map(
        [...mesh.cells.values()].map((c) => [
          c.id,
          c.vertexIds.map((id) => `${vpt(id).x},${vpt(id).y}`).join(" "),
        ])
      ),
    [mesh, vpt]
  );

  // Sets of highlighted edge IDs
  const hoveredEdgeIds = useMemo(
    () => new Set(hovered?.type === "edge" ? (hovered.traceIds ?? [hovered.id as EdgeId]) : []),
    [hovered]
  );
  const selectedEdgeIds = useMemo(
    () => new Set(selected?.type === "edge" ? (selected.traceIds ?? [selected.id as EdgeId]) : []),
    [selected]
  );

  const showVertexHandles = editMode && tool === "vertex";

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full max-w-4xl touch-none rounded border border-gray-300"
      style={{ background: PALETTE.paper }}
      onPointerMove={onSvgPointerMove}
      onPointerUp={onSvgPointerUp}
      onPointerCancel={onSvgPointerUp}
      onPointerLeave={clearHover}
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

      {/* ── Cell content ────────────────────────────────────────────────── */}
      {[...mesh.cells.values()].map((c) => (
        <CellContent key={`cc-${c.id}`} cell={c} mesh={mesh} />
      ))}

      {/* ── Rivers ──────────────────────────────────────────────────────── */}
      {[...mesh.edges.values()]
        .filter((e) => e.data.feature === "river")
        .map((e) => {
          const va = vpt(e.a), vb = vpt(e.b);
          return (
            <g key={e.id}>
              <line x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
                stroke={PALETTE.riverEdge} strokeWidth={8} strokeLinecap="round" />
              <line x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
                stroke={PALETTE.riverFill} strokeWidth={5.5} strokeLinecap="round" />
            </g>
          );
        })}

      {/* ── Roads ───────────────────────────────────────────────────────── */}
      {[...mesh.edges.values()]
        .filter((e) => e.data.feature === "road")
        .map((e) => {
          const va = vpt(e.a), vb = vpt(e.b);
          return (
            <g key={e.id}>
              <line x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
                stroke={PALETTE.roadOuter} strokeWidth={5} strokeLinecap="round" />
              <line x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
                stroke={PALETTE.roadInner} strokeWidth={2.2} strokeLinecap="round" />
            </g>
          );
        })}

      {/* ── Walls ───────────────────────────────────────────────────────── */}
      {[...mesh.edges.values()]
        .filter((e) => e.data.feature === "wall")
        .map((e) => {
          const va = vpt(e.a), vb = vpt(e.b);
          return (
            <line key={e.id}
              x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
              stroke={PALETTE.wallStroke} strokeWidth={3.5} strokeLinecap="square" />
          );
        })}

      {/* ── Vertex features (gates, bridges, towers) ─────────────────────── */}
      {[...mesh.vertices.values()]
        .filter((v) => v.data.feature !== "none")
        .map((v) => {
          const f = v.data.feature;
          return (
            <g key={v.id}>
              {(f === "gate" || f === "tower") && (
                <circle cx={v.x} cy={v.y} r={f === "tower" ? 7 : 5}
                  fill={PALETTE.wallFill} stroke={PALETTE.wallStroke} strokeWidth={1.5} />
              )}
              {f === "bridge" && (
                <>
                  <circle cx={v.x} cy={v.y} r={6}
                    fill={PALETTE.bridge} stroke={PALETTE.roadOuter} strokeWidth={1.5} />
                  <line x1={v.x - 4} y1={v.y} x2={v.x + 4} y2={v.y}
                    stroke="white" strokeWidth={1} />
                </>
              )}
            </g>
          );
        })}

      {/* ── Edit mode: hover / selection overlays ─────────────────────────── */}
      {editMode && (
        <g>
          {/* Cell hover + selection overlays */}
          {[...mesh.cells.values()].map((c) => {
            const isHov = hovered?.type === "cell" && hovered.id === c.id;
            const isSel = selected?.type === "cell" && selected.id === c.id;
            if (!isHov && !isSel) return null;
            return (
              <polygon
                key={`ov-${c.id}`}
                points={cellPoints.get(c.id)}
                fill={isSel ? PALETTE.selected : PALETTE.hover}
                stroke={isSel ? "#d97706" : "#f59e0b"}
                strokeWidth={isSel ? 2 : 1}
                pointerEvents="none"
              />
            );
          })}

          {/* Edge hover + selection overlays */}
          {[...mesh.edges.values()].map((e) => {
            const isHov = hoveredEdgeIds.has(e.id);
            const isSel = selectedEdgeIds.has(e.id);
            if (!isHov && !isSel) return null;
            const va = vpt(e.a), vb = vpt(e.b);
            return (
              <line key={`ov-${e.id}`}
                x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
                stroke={isSel ? "#d97706" : "#f59e0b"}
                strokeWidth={isSel ? 8 : 7}
                strokeLinecap="round"
                opacity={0.45}
                pointerEvents="none"
              />
            );
          })}

          {/* Vertex hover + selection overlays */}
          {[...mesh.vertices.values()].map((v) => {
            const isHov = hovered?.type === "vertex" && hovered.id === v.id;
            const isSel = selected?.type === "vertex" && selected.id === v.id;
            if (!isHov && !isSel) return null;
            return (
              <circle key={`ov-${v.id}`}
                cx={v.x} cy={v.y} r={10}
                fill={isSel ? PALETTE.selected : PALETTE.hover}
                stroke={isSel ? "#d97706" : "#f59e0b"}
                strokeWidth={1.5}
                pointerEvents="none"
              />
            );
          })}

          {/* ── Hit areas for cells ──────────────────────────────────────── */}
          {tool !== "vertex" &&
            [...mesh.cells.values()].map((c) => (
              <polygon
                key={`hit-c-${c.id}`}
                points={cellPoints.get(c.id)}
                fill="transparent"
                stroke="none"
                style={{ cursor: tool === "paint" ? "crosshair" : "pointer" }}
                onPointerEnter={() => hoverCell(c.id)}
                onPointerLeave={clearHover}
                onPointerDown={() => clickCell(c.id)}
              />
            ))}

          {/* ── Hit areas for edges ──────────────────────────────────────── */}
          {tool === "select" &&
            [...mesh.edges.values()].map((e) => {
              if (e.data.feature === "none") return null;
              const va = vpt(e.a), vb = vpt(e.b);
              return (
                <line
                  key={`hit-e-${e.id}`}
                  x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
                  stroke="transparent"
                  strokeWidth={12}
                  strokeLinecap="round"
                  className="cursor-pointer"
                  onPointerEnter={() => hoverEdge(e.id)}
                  onPointerLeave={clearHover}
                  onClick={() => clickEdge(e.id)}
                />
              );
            })}

          {/* ── Hit areas for vertices (select tool) ─────────────────────── */}
          {tool === "select" &&
            [...mesh.vertices.values()]
              .filter((v) => v.data.feature !== "none")
              .map((v) => (
                <circle
                  key={`hit-v-${v.id}`}
                  cx={v.x} cy={v.y} r={12}
                  fill="transparent"
                  stroke="none"
                  className="cursor-pointer"
                  onPointerEnter={() => hoverVertex(v.id)}
                  onPointerLeave={clearHover}
                  onClick={() => clickVertex(v.id)}
                />
              ))}
        </g>
      )}

      {/* ── Vertex drag handles (vertex tool only) ────────────────────────── */}
      {showVertexHandles &&
        [...mesh.vertices.values()].map((v) => (
          <circle
            key={`vh-${v.id}`}
            cx={v.x} cy={v.y} r={5}
            fill={PALETTE.selected}
            stroke={PALETTE.roadOuter}
            strokeWidth={1.5}
            className="cursor-grab active:cursor-grabbing"
            onPointerEnter={() => hoverVertex(v.id)}
            onPointerLeave={clearHover}
            onPointerDown={onVertexPointerDown(v.id)}
          />
        ))}
    </svg>
  );
};
