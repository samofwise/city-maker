import { useMemo } from "react";
import { centroid } from "../../../lib/geometry";
import { PALETTE } from "../../../lib/terrain";
import { bbox, cellRng, type CellRenderProps } from "./utils";

export const WaterCell = ({ clipPts, seed }: CellRenderProps) => {
  const ripples = useMemo(() => {
    const rng = cellRng(seed + "w");
    const bb = bbox(clipPts);
    const cen = centroid(clipPts);
    return Array.from({ length: 3 + Math.floor(rng() * 3) }, () => ({
      x: cen.x + (rng() - 0.5) * (bb.maxX - bb.minX) * 0.5,
      y: cen.y + (rng() - 0.5) * (bb.maxY - bb.minY) * 0.5,
      rx: 8 + rng() * 14,
      ry: 0,
    })).map((r) => ({ ...r, ry: r.rx * (0.3 + cellRng(seed + r.x)() * 0.25) }));
  }, [clipPts, seed]);

  return (
    <>
      {ripples.map((r, i) => (
        <ellipse
          key={`rp-${seed}-${i}`}
          cx={r.x}
          cy={r.y}
          rx={r.rx}
          ry={r.ry}
          fill="none"
          stroke={PALETTE.waterDark}
          strokeWidth={0.8}
          opacity={0.4}
        />
      ))}
    </>
  );
};
