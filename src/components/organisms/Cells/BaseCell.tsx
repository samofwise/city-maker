/**
 * Computes the inset clip polygon for a cell and dispatches to the
 * terrain-specific renderer. Per-cell content (buildings, trees, crops,
 * ripples) is owned by the individual Cell components in this folder.
 */
import { useMemo } from "react";
import { computeCellInset, type Cell, type VertexId } from "../../../lib/mesh";
import type { CellData } from "../../../lib/terrain";
import type { CityMesh } from "../../../types/CityMap";
import { CityCell } from "./CityCell";
import { EmptyCell } from "./EmptyCell";
import { FarmCell } from "./FarmCell";
import { ForestCell } from "./ForestCell";
import { GrassCell } from "./GrassCell";
import { OceanCell } from "./OceanCell";

interface BaseCellProps {
  cell: Cell<CellData>;
  mesh: CityMesh;
}

export const BaseCell = ({ cell, mesh }: BaseCellProps) => {
  const { terrain, density } = cell.data;

  // Stable key for memoisation — recompute only when vertex positions change
  const vertexKey = cell.vertexIds
    .map((id: VertexId) => {
      const v = mesh.vertices.get(id);
      return v ? `${v.x.toFixed(1)},${v.y.toFixed(1)}` : "";
    })
    .join("|");

  const clipPts = useMemo(
    () => computeCellInset(cell, mesh),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cell.id, vertexKey, terrain, density]
  );

  if (clipPts.length < 3) return null;

  const props = { clipPts, seed: cell.id, density };

  switch (terrain) {
    case "city":
      return <CityCell {...props} />;
    // case "forest":
    //   return <ForestCell {...props} />;
    // case "farm":
    //   return <FarmCell {...props} />;
    // case "grass":
    //   return <GrassCell {...props} />;
    // case "water":
    //   return <WaterCell {...props} />;
    default:
      return <EmptyCell />;
  }
};
