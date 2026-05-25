import { useMemo } from "react";
import { toSvgPoints } from "../../../lib/geometry";
import { createAlleyBuildings, wardConfigForCell } from "../../../lib/buildingGen";
import { PALETTE } from "../../../lib/terrain";
import { cellRng, type CellRenderProps } from "./utils";

export const MarketCell = ({ clipPts, seed, density }: CellRenderProps) => {
  const buildings = useMemo(() => {
    const cfg = wardConfigForCell("market", density);
    const rng = cellRng(seed + "bld");
    return createAlleyBuildings(clipPts, cfg, rng);
  }, [clipPts, seed, density]);

  if (!buildings || buildings.length === 0) return null;

  return (
    <g>
      {buildings.map((bPts, i) => (
        <polygon
          key={`bo-${seed}-${i}`}
          points={toSvgPoints(bPts)}
          fill={PALETTE.cityDark}
          stroke={PALETTE.wallStroke}
          strokeWidth={0.5}
        />
      ))}
      {buildings.map((bPts, i) => (
        <polygon
          key={`bf-${seed}-${i}`}
          points={toSvgPoints(bPts)}
          fill={PALETTE.marketDark}
          stroke="none"
          strokeWidth={0}
        />
      ))}
    </g>
  );
};
