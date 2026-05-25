/**
 * Ports TownGeneratorOS `CityMap.drawBuilding` and the `Market.hx` plaza
 * centroid feature.
 *
 * - Regular city patches: one polygon per building with a thin dark stroke over a
 *   light fill (TownGen single-pass equivalent — SVG centers strokes on the
 *   path, matching the OpenFL stroke-then-fill output).
 * - Low-density patches (plaza/market): no alleys; instead a single small statue
 *   (rotated rect) or fountain (circle) at the patch centroid, like
 *   `wards/Market.hx createGeometry`.
 */
import { useMemo } from "react";
import {
  createAlleyBuildings,
  wardConfigForCell,
} from "../../../lib/buildingGen";
import {
  centroid,
  insetPolygon,
  polyArea,
  sub,
  toSvgPoints,
  type Pt,
} from "../../../lib/geometry";
import { PALETTE } from "../../../lib/terrain";
import { cellRng, type CellRenderProps } from "./utils";

// TownGen Brush.NORMAL_STROKE = 0.3. In SVG we want ~0.6 visible — strokes
// are centered on the path so this gives ~0.3 outside each polygon edge.
const BUILDING_STROKE = 0.6;
const CASTLE_STROKE = 1.2;

// TownGen `getCityBlock` shrinks each edge by half a street width before
// subdivision: MAIN_STREET/2 (≈1) on wall/artery edges, REGULAR_STREET/2
// (≈0.5) inside the walls, ALLEY/2 (≈0.3) on outskirt edges. Scaled to our
// ~3× larger world: 3 for inner ward edges, 2 for outskirts.
const INNER_STREET_INSET = 3;
const OUTER_STREET_INSET = 3;

export const CityCell = ({ clipPts, seed, density }: CellRenderProps) => {
  // Plaza / market threshold — TownGen's Market patch has no alleys, just a
  // centroid feature on the otherwise-empty paper-colored patch.
  const isMarket = density < 0.25;

  const buildings = useMemo(() => {
    if (isMarket) return [];
    // Per-edge street shrink. computeCellInset already shrinks road/wall
    // edges by their CLEARANCE; this layer adds the small extra setback that
    // separates one block of buildings from the next where the boundary is
    // just a cell→cell edge. Inner wards (slum/craftsmen, density ≥ 0.45)
    // get more setback for clear street grids; outskirts (patriciate ring)
    // use the smaller ALLEY-class setback like TownGen's outskirt patches.
    const setback = density >= 0.45 ? INNER_STREET_INSET : OUTER_STREET_INSET;
    const insets = clipPts.map(() => setback);
    const block = insetPolygon(clipPts, insets);
    if (block.length < 3 || polyArea(block) < polyArea(clipPts) * 0.25) {
      return [];
    }
    const cfg = wardConfigForCell("city", density);
    const rng = cellRng(seed + "bld");
    return createAlleyBuildings(block, cfg, rng);
  }, [clipPts, seed, density, isMarket]);

  if (isMarket) return <MarketFeature clipPts={clipPts} seed={seed} />;

  if (buildings.length === 0) return null;

  // Castle-like extra-low density would warrant a thicker stroke; for now
  // every CommonWard uses NORMAL_STROKE.
  const stroke = density < 0.3 ? CASTLE_STROKE : BUILDING_STROKE;

  return (
    <g>
      {buildings.map((bPts, i) => (
        <polygon
          key={`b-${seed}-${i}`}
          points={toSvgPoints(bPts)}
          fill={PALETTE.cityDark}
          stroke={PALETTE.wallStroke}
          strokeWidth={stroke}
          strokeLinejoin="miter"
        />
      ))}
    </g>
  );
};

// ── Plaza centroid feature (TownGen Market.hx) ───────────────────────────────

interface MarketFeatureProps {
  clipPts: Pt[];
  seed: string;
}

const MarketFeature = ({ clipPts, seed }: MarketFeatureProps) => {
  const feature = useMemo(() => {
    const rng = cellRng(seed + "mkt");
    const c = centroid(clipPts);
    // Scale the feature with the patch — TownGen used fixed pixel sizes
    // tuned to its ~200u city. Ours is bigger, so derive from patch area.
    const r = Math.sqrt(polyArea(clipPts)) * 0.18;

    // 60% statue (rotated rect aligned to the longest edge), 40% fountain.
    if (rng() < 0.6) {
      let bestLen = -1;
      let angle = 0;
      for (let i = 0; i < clipPts.length; i++) {
        const a = clipPts[i]!;
        const b = clipPts[(i + 1) % clipPts.length]!;
        const e = sub(b, a);
        const l = Math.hypot(e.x, e.y);
        if (l > bestLen) {
          bestLen = l;
          angle = Math.atan2(e.y, e.x);
        }
      }
      return { kind: "statue" as const, c, r, angle };
    }
    return { kind: "fountain" as const, c, r };
  }, [clipPts, seed]);

  if (feature.kind === "fountain") {
    return (
      <g>
        <circle
          cx={feature.c.x}
          cy={feature.c.y}
          r={feature.r}
          fill={PALETTE.city}
          stroke={PALETTE.wallStroke}
          strokeWidth={BUILDING_STROKE}
        />
        <circle
          cx={feature.c.x}
          cy={feature.c.y}
          r={feature.r * 0.45}
          fill={PALETTE.waterDark}
          stroke="none"
        />
      </g>
    );
  }

  // Statue: rotated rectangle (long-edge aligned, like TownGen).
  const w = feature.r * 0.7;
  const h = feature.r * 1.6;
  const cos = Math.cos(feature.angle);
  const sin = Math.sin(feature.angle);
  const corners: Pt[] = [
    { x: -w, y: -h },
    { x: w, y: -h },
    { x: w, y: h },
    { x: -w, y: h },
  ].map((p) => ({
    x: feature.c.x + p.x * cos - p.y * sin,
    y: feature.c.y + p.x * sin + p.y * cos,
  }));

  return (
    <polygon
      points={toSvgPoints(corners)}
      fill={PALETTE.city}
      stroke={PALETTE.wallStroke}
      strokeWidth={BUILDING_STROKE}
    />
  );
};
