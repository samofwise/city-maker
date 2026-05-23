import { useCallback, useMemo, useRef, type PointerEvent } from "react";
import { traceFeature, type CellId, type EdgeId, type VertexId } from "../../lib/mesh";
import { CellPolygon, EdgeLine } from "./CellLayer";
import { useMap } from "../../contexts/MapContext";
import { PALETTE, type VertexData } from "../../lib/terrain";

export const WIDTH  = 800;
export const HEIGHT = 600;

// ── Component ──────────────────────────────────────────────────────────────────

export const MeshView = () => {
  const { state, dispatch } = useMap();
  const { city: { mesh }, editMode, tool, hovered, selected } = state;

  const draggingRef  = useRef<VertexId | null>(null);
  const paintingRef  = useRef(false);
  const svgRef       = useRef<SVGSVGElement>(null);

  const toSvgPoint = (e: PointerEvent<SVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(WIDTH,  ((e.clientX - rect.left) / rect.width)  * WIDTH)),
      y: Math.max(0, Math.min(HEIGHT, ((e.clientY - rect.top)  / rect.height) * HEIGHT)),
    };
  };

  // ── Paint cell ─────────────────────────────────────────────────────────────

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
    if (tool === "paint" && paintingRef.current) paintCell(id);
  }, [editMode, tool, dispatch, paintCell]);

  const hoverEdge = useCallback((id: EdgeId) => {
    if (!editMode || tool !== "select") return;
    const e = mesh.edges.get(id);
    if (!e) return;
    const traceIds = e.data.feature !== "none" ? traceFeature(mesh, id) : undefined;
    dispatch({ type: "HOVER", sel: { type: "edge", id, traceIds } });
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
    if (tool === "select") dispatch({ type: "SELECT", sel: { type: "cell", id } });
    if (tool === "paint")  { paintingRef.current = true; paintCell(id); }
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

  // ── Vertex drag ────────────────────────────────────────────────────────────

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

  // ── Stable vertex position accessor ───────────────────────────────────────

  const vpt = useCallback((id: VertexId) => mesh.vertices.get(id)!, [mesh]);

  // ── Per-cell points strings (stable keys → React.memo skips unaffected) ───

  const cellPoints = useMemo(
    () =>
      new Map(
        [...mesh.cells.values()].map((c) => [
          c.id,
          c.vertexIds.map((id) => `${vpt(id).x.toFixed(2)},${vpt(id).y.toFixed(2)}`).join(" "),
        ])
      ),
    [mesh, vpt]
  );

  // ── Highlighted edge sets ──────────────────────────────────────────────────

  const hoveredEdgeIds = useMemo(
    () => new Set(hovered?.type === "edge" ? (hovered.traceIds ?? [hovered.id as EdgeId]) : []),
    [hovered]
  );
  const selectedEdgeIds = useMemo(
    () => new Set(selected?.type === "edge" ? (selected.traceIds ?? [selected.id as EdgeId]) : []),
    [selected]
  );

  // ── Vertex drag highlight: cells/edges adjacent to dragged vertex ──────────

  const dragVertex = draggingRef.current;
  const dragHighlightCells = useMemo(() => {
    if (!dragVertex) return new Set<CellId>();
    return new Set(mesh.index.vertexCells.get(dragVertex) ?? []);
  }, [dragVertex, mesh.index]);

  const toolCursor = tool === "paint" ? "crosshair" : "pointer";

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
      {/* ── Cells (memoised — only affected cells re-render on vertex drag) ── */}
      {[...mesh.cells.values()].map((c) => {
        const isHovered  = hovered?.type === "cell" && hovered.id === c.id;
        const isSelected = selected?.type === "cell" && selected.id === c.id;
        return (
          <CellPolygon
            key={c.id}
            cell={c}
            mesh={mesh}
            pointsStr={cellPoints.get(c.id) ?? ""}
            isHovered={isHovered || (editMode && tool === "vertex" && dragHighlightCells.has(c.id))}
            isSelected={isSelected}
            onEnter={hoverCell}
            onLeave={clearHover}
            onDown={clickCell}
            editMode={editMode && tool !== "vertex"}
            toolCursor={toolCursor}
          />
        );
      })}

      {/* ── Edges (rivers first, then roads, then walls) ─────────────────── */}
      {[...mesh.edges.values()]
        .filter((e) => e.data.feature !== "none")
        .sort((a, b) => {
          const order: Record<string, number> = { river: 0, road: 1, wall: 2 };
          return (order[a.data.feature] ?? 3) - (order[b.data.feature] ?? 3);
        })
        .map((e) => {
          const va = vpt(e.a), vb = vpt(e.b);
          return (
            <EdgeLine
              key={e.id}
              edgeId={e.id}
              x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
              feature={e.data.feature}
              isHovered={hoveredEdgeIds.has(e.id)}
              isSelected={selectedEdgeIds.has(e.id)}
              onEnter={hoverEdge}
              onLeave={clearHover}
              onClick={clickEdge}
              editMode={editMode}
              showHitArea={tool === "select"}
            />
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
              {/* Vertex selection overlay */}
              {editMode && tool === "select" && (
                <circle cx={v.x} cy={v.y} r={12}
                  fill={selected?.type === "vertex" && selected.id === v.id ? PALETTE.selected : "transparent"}
                  stroke={hovered?.type === "vertex" && hovered.id === v.id ? "#f59e0b" : "transparent"}
                  strokeWidth={2}
                  className="cursor-pointer"
                  onPointerEnter={() => hoverVertex(v.id)}
                  onPointerLeave={clearHover}
                  onClick={() => clickVertex(v.id)}
                />
              )}
            </g>
          );
        })}

      {/* ── Vertex drag handles (vertex tool) ────────────────────────────── */}
      {editMode && tool === "vertex" && (
        <g>
          {/* Guide lines from dragged vertex to its neighbours */}
          {draggingRef.current &&
            (mesh.index.vertexEdges.get(draggingRef.current) ?? []).map((eid) => {
              const e  = mesh.edges.get(eid)!;
              const va = vpt(e.a), vb = vpt(e.b);
              return (
                <line key={`guide-${eid}`}
                  x1={va.x} y1={va.y} x2={vb.x} y2={vb.y}
                  stroke="#d97706" strokeWidth={1} strokeDasharray="4 3" opacity={0.6}
                  pointerEvents="none"
                />
              );
            })}

          {[...mesh.vertices.values()].map((v) => {
            const isDragging = draggingRef.current === v.id;
            const isHov      = hovered?.type === "vertex" && hovered.id === v.id;
            const feat       = v.data.feature as VertexData["feature"];
            const hasFeat    = feat !== "none";
            return (
              <g key={`vh-${v.id}`}>
                {/* Feature symbol background (so it's visible through the handle) */}
                {hasFeat && (
                  <circle cx={v.x} cy={v.y} r={isDragging ? 9 : 6}
                    fill={PALETTE.wallFill} stroke={PALETTE.wallStroke} strokeWidth={1}
                    pointerEvents="none"
                  />
                )}
                {/* Drag handle */}
                <circle
                  cx={v.x} cy={v.y}
                  r={isDragging ? 8 : isHov ? 6 : 4.5}
                  fill={isDragging ? "#dc2626" : isHov ? PALETTE.selected : "rgba(255,255,255,0.85)"}
                  stroke={isDragging ? "#991b1b" : PALETTE.roadOuter}
                  strokeWidth={isDragging ? 2 : 1.5}
                  className="cursor-grab active:cursor-grabbing"
                  onPointerEnter={() => hoverVertex(v.id)}
                  onPointerLeave={clearHover}
                  onPointerDown={onVertexPointerDown(v.id)}
                />
              </g>
            );
          })}

          {/* Live coordinate tooltip for dragged vertex */}
          {draggingRef.current && (() => {
            const v = vpt(draggingRef.current);
            return (
              <g pointerEvents="none">
                <rect
                  x={v.x + 10} y={v.y - 22}
                  width={80} height={16}
                  rx={3} fill="rgba(0,0,0,0.6)"
                />
                <text
                  x={v.x + 14} y={v.y - 10}
                  fill="white" fontSize={10} fontFamily="monospace"
                >
                  {v.x.toFixed(0)}, {v.y.toFixed(0)}
                </text>
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
};
