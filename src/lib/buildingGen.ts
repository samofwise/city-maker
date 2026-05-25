/**
 * Building generation via recursive binary-space partition. Ports the
 * TownGeneratorOS createAlleys / Cutter.bisect / Polygon.cut algorithm.
 *
 * Reference: Ward.hx createAlleys(), Cutter.hx bisect(), Polygon.hx cut()
 */

import { getPercentValue } from "~/helpers/valueHelpers";
import {
  add,
  cutPolygon,
  interpolatePt,
  norm,
  perp,
  polyArea,
  scale,
  sub,
  type Pt,
} from "./geometry";

// ── Ward configuration (mirrors TownGeneratorOS ward types) ──────────────────

export interface WardConfig {
  /** Minimum building area (world-space sq units). Small = dense fine-grained. */
  minSq: number;
  /** 0–1: how much angle/offset chaos is applied when choosing the cut. */
  gridChaos: number;
  /** 0–1: how much size variation between buildings. */
  sizeChaos: number;
  /**
   * Probability that a terminal polygon becomes an empty lot instead of a
   * building.
   */
  emptyProb: number;
}

// ── ALLEY width (gap inserted at each recursive cut) ─────────────────────────
// TownGen ALLEY = 0.6 in ~24u patches → ~2.5%. Our cells are ~70u so 2u keeps
// the same ratio while remaining clearly visible at our zoom.
const ALLEY_GAP = 4;

// ── Core recursive subdivision ───────────────────────────────────────────────

/**
 * Recursively subdivide `poly` into building footprints using the
 * TownGeneratorOS createAlleys algorithm.
 *
 * @param poly Polygon (after ward inset) to fill with buildings.
 * @param cfg Ward parameters controlling density/chaos/size.
 * @param rng Seeded PRNG for deterministic output.
 * @param depth Guard against infinite recursion.
 */
export function createAlleyBuildings(
  poly: Pt[],
  cfg: WardConfig,
  rng: () => number,
  split = true,
  depth = 0
): Pt[][] {
  if (poly.length < 3 || depth > 14) return [];

  const area = polyArea(poly);

  // Find the longest edge — we bisect from its start vertex.
  let longestLen = -1;
  let longestIdx = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!,
      b = poly[(i + 1) % poly.length]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > longestLen) {
      longestLen = d;
      longestIdx = i;
    }
  }

  const vertex = poly[longestIdx]!;
  const next = poly[(longestIdx + 1) % poly.length]!;

  // Position along the edge (ratio ≈ 0.5 ± spread/2)
  const spread = 0.8 * cfg.gridChaos;
  const ratio = (1 - spread) / 2 + rng() * spread;

  // Angle jitter — zeroed for small polygons so terminal blocks stay
  // rectangular even in chaotic wards (TownGen `area < minSq*4 ? 0 : 1`).
  const angleRange =
    (Math.PI / 6) * cfg.gridChaos * (area < cfg.minSq * 4 ? 0 : 1);
  const angle = (rng() - 0.5) * angleRange;

  // Cut chord: perpendicular to the (rotated) longest edge through the ratio
  // point. cutP2 is set far enough out that the chord exits the polygon on
  // both sides.
  const cutPt = interpolatePt(vertex, next, ratio);
  const edgeDir = norm(sub(next, vertex));
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const rotated = {
    x: edgeDir.x * cos - edgeDir.y * sin,
    y: edgeDir.y * cos + edgeDir.x * sin,
  };
  const cutDir = perp(rotated);
  const cutP2 = add(cutPt, scale(cutDir, longestLen * 4));

  // `split` is set by the parent: ALLEY gap on cuts of large halves,
  // no gap on cuts of small halves (tight row buildings inside a block).
  const gap = split ? ALLEY_GAP : 0;

  const halves = cutPolygon(poly, cutPt, cutP2, gap);
  if (!halves) return [poly];

  const buildings: Pt[][] = [];
  for (const half of halves) {
    if (half.length < 3) continue;
    // Per-half terminal threshold (TownGen rolls this fresh for each half).
    const halfArea = polyArea(half);
    const exponent = 4 * cfg.sizeChaos * (rng() - 0.5);
    const terminalSq = cfg.minSq * Math.pow(2, exponent);
    if (halfArea < terminalSq) {
      if (rng() > cfg.emptyProb) buildings.push(half);
      continue;
    }
    // Decide whether the recursive cut on this half gets an alley.
    // TownGen: split = half.square > minSq / (rand * rand) — heavy-tailed
    // so only the largest halves keep splitting with gaps.
    const childSplit = halfArea > cfg.minSq / Math.max(rng() * rng(), 0.001);
    buildings.push(
      ...createAlleyBuildings(half, cfg, rng, childSplit, depth + 1)
    );
  }
  return buildings;
}

// Pre-tuned configs to give each cell 30–60 buildings (TownGen's ward density)
// so the `childSplit = halfArea > minSq/(rand*rand)` heavy tail fires at
// multiple recursion depths, producing visible nested blocks of row houses.
// Cell area ≈ 4000 sq-units, so minSq * 30 ≈ 4000 → minSq ≈ 130 for "typical".
export const WARD_CONFIGS = {
  // Tiny, chaotic, dense — lots of small buildings crammed together
  slum: { minSq: 300, gridChaos: 0.85, sizeChaos: 0.8, emptyProb: 0.03 },
  // Moderate size, semi-regular — tradespeople and craftsmen
  craftsmen: { minSq: 110, gridChaos: 0.6, sizeChaos: 0.7, emptyProb: 0.04 },
  // Larger buildings, less chaotic, frequent courtyards
  patriciate: { minSq: 240, gridChaos: 0.55, sizeChaos: 0.8, emptyProb: 0.18 },
} satisfies Record<string, WardConfig>;

// ── Ward config selector by terrain type + density ───────────────────────────

const EMPTY_RANGE = { min: 0.02, max: 0.28 };

export function wardConfigForCell(
  _terrain: string,
  density: number
): WardConfig {
  const emptyProb = getPercentValue(EMPTY_RANGE, density);

  return {
    gridChaos: 0.5,
    emptyProb,
    sizeChaos: 0.6,
    minSq: 300,
  };
}
