import { useMemo } from "react";
import { pointInPolygon } from "../../../lib/geometry";
import { PALETTE } from "../../../lib/terrain";
import { bbox, cellRng, type CellRenderProps } from "./utils";

/**
 * Open grassland: a few short tufted strokes scattered through the cell.
 * Density nudges the tuft count but stays sparse — this is meant to read as
 * flat ground, not a forest.
 */
export const GrassCell = ({ clipPts, seed, density }: CellRenderProps) => {
  const tufts = useMemo(() => {
    const rng = cellRng(seed + "g");
    const bb = bbox(clipPts);
    const count = Math.round(8 + density * 14);
    const out: { x: number; y: number; angle: number; len: number }[] = [];
    for (let i = 0; i < count * 6 && out.length < count; i++) {
      const x = bb.minX + rng() * (bb.maxX - bb.minX);
      const y = bb.minY + rng() * (bb.maxY - bb.minY);
      if (!pointInPolygon({ x, y }, clipPts)) continue;
      out.push({
        x,
        y,
        angle: -Math.PI / 2 + (rng() - 0.5) * 0.4,
        len: 2 + rng() * 1.5,
      });
    }
    return out;
  }, [clipPts, seed, density]);

  return (
    <>
      {tufts.map((t, i) => (
        <line
          key={`gr-${seed}-${i}`}
          x1={t.x}
          y1={t.y}
          x2={t.x + Math.cos(t.angle) * t.len}
          y2={t.y + Math.sin(t.angle) * t.len}
          stroke={PALETTE.grassDark}
          strokeWidth={0.7}
          strokeLinecap="round"
          opacity={0.7}
        />
      ))}
    </>
  );
};
