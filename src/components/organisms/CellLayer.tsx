/**
 * Memoised per-cell rendering. Each CellPolygon only re-renders when one
 * of its own vertex positions changes, making vertex drag O(adjacent-cells)
 * instead of O(all-cells).
 */
import { memo } from "react";
import { CellContent } from "./CellContent";
import { PALETTE, type CellData, type EdgeData, type VertexData } from "../../lib/terrain";
import type { Cell, Mesh, VertexId } from "../../lib/mesh";

type CityMesh = Mesh<VertexData, EdgeData, CellData>;

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

interface CellPolygonProps {
  cell:       Cell<CellData>;
  mesh:       CityMesh;
  pointsStr:  string; // pre-computed "x,y x,y …" - used for memo check
  isHovered:  boolean;
  isSelected: boolean;
  onEnter:    (id: import("../../lib/mesh").CellId) => void;
  onLeave:    () => void;
  onDown:     (id: import("../../lib/mesh").CellId) => void;
  editMode:   boolean;
  toolCursor: string;
}

export const CellPolygon = memo(({
  cell, mesh, pointsStr, isHovered, isSelected,
  onEnter, onLeave, onDown, editMode, toolCursor,
}: CellPolygonProps) => {
  const terrain = cell.data.terrain;
  return (
    <g>
      <polygon
        points={pointsStr}
        fill={TERRAIN_FILL[terrain]}
        stroke={TERRAIN_STROKE[terrain]}
        strokeWidth={0.7}
      />
      <CellContent cell={cell} mesh={mesh} />
      {(isHovered || isSelected) && (
        <polygon
          points={pointsStr}
          fill={isSelected ? PALETTE.selected : PALETTE.hover}
          stroke={isSelected ? "#d97706" : "#f59e0b"}
          strokeWidth={isSelected ? 2 : 1}
          pointerEvents="none"
        />
      )}
      {editMode && (
        <polygon
          points={pointsStr}
          fill="transparent"
          stroke="none"
          style={{ cursor: toolCursor }}
          onPointerEnter={() => onEnter(cell.id)}
          onPointerLeave={onLeave}
          onPointerDown={() => onDown(cell.id)}
        />
      )}
    </g>
  );
});

CellPolygon.displayName = "CellPolygon";

// ── Edge rendering (memoised per feature layer) ───────────────────────────────

interface EdgeLineProps {
  x1: number; y1: number;
  x2: number; y2: number;
  feature:    import("../../lib/terrain").EdgeFeature;
  isHovered:  boolean;
  isSelected: boolean;
  onEnter:    (id: import("../../lib/mesh").EdgeId) => void;
  onLeave:    () => void;
  onClick:    (id: import("../../lib/mesh").EdgeId) => void;
  edgeId:     import("../../lib/mesh").EdgeId;
  editMode:   boolean;
  showHitArea: boolean;
}

export const EdgeLine = memo(({
  x1, y1, x2, y2, feature, isHovered, isSelected,
  onEnter, onLeave, onClick, edgeId, editMode, showHitArea,
}: EdgeLineProps) => {
  const hColor = isSelected ? "#d97706" : "#f59e0b";

  return (
    <g>
      {feature === "river" && (
        <>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={PALETTE.riverEdge} strokeWidth={8} strokeLinecap="round" />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={PALETTE.riverFill} strokeWidth={5.5} strokeLinecap="round" />
        </>
      )}
      {feature === "road" && (
        <>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={PALETTE.roadOuter} strokeWidth={5} strokeLinecap="round" />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={PALETTE.roadInner} strokeWidth={2.2} strokeLinecap="round" />
        </>
      )}
      {feature === "wall" && (
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={PALETTE.wallStroke} strokeWidth={3.5} strokeLinecap="square" />
      )}
      {(isHovered || isSelected) && (
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={hColor} strokeWidth={isSelected ? 8 : 7} strokeLinecap="round" opacity={0.45} pointerEvents="none" />
      )}
      {editMode && showHitArea && (
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="transparent" strokeWidth={12} strokeLinecap="round"
          className="cursor-pointer"
          onPointerEnter={() => onEnter(edgeId)}
          onPointerLeave={onLeave}
          onClick={() => onClick(edgeId)}
        />
      )}
    </g>
  );
});

EdgeLine.displayName = "EdgeLine";
