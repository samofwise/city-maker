import { useMemo } from "react";
import { PALETTE } from "../../../lib/terrain";
import { bbox, cellRng, clipSegmentToPolygon, type CellRenderProps } from "./utils";

export const FarmCell = ({ clipPts, seed }: CellRenderProps) => {
  const lines = useMemo(() => {
    const rng  = cellRng(seed + "c");
    const bb   = bbox(clipPts);
    const span = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 1.5;
    const cx   = (bb.minX + bb.maxX) / 2;
    const cy   = (bb.minY + bb.maxY) / 2;
    const angle = (rng() * 60 - 30) * (Math.PI / 180);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const out: [number, number, number, number][] = [];
    for (let d = -span / 2; d < span / 2; d += 7) {
      const px = cx - sin * d, py = cy + cos * d;
      const a = { x: px - cos * span / 2, y: py - sin * span / 2 };
      const b = { x: px + cos * span / 2, y: py + sin * span / 2 };
      for (const [p, q] of clipSegmentToPolygon(a, b, clipPts)) {
        out.push([p.x, p.y, q.x, q.y]);
      }
    }
    return out;
  }, [clipPts, seed]);

  return (
    <>
      {lines.map(([x1, y1, x2, y2], i) => (
        <line
          key={`cr-${seed}-${i}`}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={PALETTE.farmDark} strokeWidth={0.8} opacity={0.55}
        />
      ))}
    </>
  );
};
