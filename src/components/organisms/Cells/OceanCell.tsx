import { useMemo } from "react";
import { pointInPolygon } from "../../../lib/geometry";
import { PALETTE } from "../../../lib/terrain";
import { bbox, cellRng, type CellRenderProps } from "./utils";

export const OceanCell = ({ clipPts, seed }: CellRenderProps) => {
  const waves = useMemo(() => {
    const rng = cellRng(seed + "w");
    const bb = bbox(clipPts);

    // Stagger waves on a jittered grid so they read as rows of caps rather
    // than a random scatter (which is what real wave patterns look like).
    const spacing = 14;
    const rowH = 9;
    const out: { x: number; y: number; len: number; amp: number }[] = [];
    for (let y = bb.minY + rowH; y < bb.maxY; y += rowH) {
      const rowOffset = rng() * spacing;
      for (let x = bb.minX + rowOffset; x < bb.maxX; x += spacing) {
        const jx = x + (rng() - 0.5) * 4;
        const jy = y + (rng() - 0.5) * 3;
        if (!pointInPolygon({ x: jx, y: jy }, clipPts)) continue;
        if (rng() < 0.25) continue; // sparse skips
        out.push({
          x: jx,
          y: jy,
          len: 5 + rng() * 4,
          amp: 1.2 + rng() * 1.2,
        });
      }
    }
    return out;
  }, [clipPts, seed]);

  return (
    <>
      {waves.map((wv, i) => {
        // Tilde: M(left) Q(up-control, mid) Q(down-control, right)
        const x0 = wv.x - wv.len;
        const x2 = wv.x;
        const x4 = wv.x + wv.len;
        const d = `M ${x0} ${wv.y} Q ${wv.x - wv.len / 2} ${wv.y - wv.amp} ${x2} ${wv.y} Q ${wv.x + wv.len / 2} ${wv.y + wv.amp} ${x4} ${wv.y}`;
        return (
          <path
            key={`wv-${seed}-${i}`}
            d={d}
            fill="none"
            stroke={PALETTE.waterDark}
            strokeWidth={0.7}
            strokeLinecap="round"
            opacity={0.55}
          />
        );
      })}
    </>
  );
};
