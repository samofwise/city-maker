import { useMemo } from "react";
import { pointInPolygon } from "../../../lib/geometry";
import { PALETTE } from "../../../lib/terrain";
import { bbox, cellRng, type CellRenderProps } from "./utils";

export const ParkCell = ({ clipPts, seed, density }: CellRenderProps) => {
  const dots = useMemo(() => {
    const rng = cellRng(seed + "t");
    const bb = bbox(clipPts);
    const count = Math.round(density * 30 + 8);
    const out: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < count * 6 && out.length < count; i++) {
      const x = bb.minX + rng() * (bb.maxX - bb.minX);
      const y = bb.minY + rng() * (bb.maxY - bb.minY);
      if (!pointInPolygon({ x, y }, clipPts)) continue;
      out.push({ x, y, r: 2.5 + rng() * 2.5 });
    }
    return out;
  }, [clipPts, seed, density]);

  return (
    <>
      {dots.map((t, i) => (
        <circle
          key={`tr-${seed}-${i}`}
          cx={t.x}
          cy={t.y}
          r={t.r}
          fill={PALETTE.parkDark}
          opacity={0.78}
        />
      ))}
    </>
  );
};
