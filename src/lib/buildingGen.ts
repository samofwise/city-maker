/**
 * Building generation via recursive binary-space partition.
 * Ports the TownGeneratorOS createAlleys / Cutter.bisect / Polygon.cut algorithm.
 *
 * Reference: Ward.hx  createAlleys(), Cutter.hx bisect(), Polygon.hx cut()
 */

import {
  add, sub, norm, scale, perp, dot,
  polyArea, interpolatePt, centroid, cutPolygon,
  type Pt,
} from "./geometry";

// ── Ward configuration (mirrors TownGeneratorOS ward types) ──────────────────

export interface WardConfig {
  /** Minimum building area (world-space sq units).  Small = dense fine-grained. */
  minSq:      number;
  /** 0–1: how much angle/offset chaos is applied when choosing the cut. */
  gridChaos:  number;
  /** 0–1: how much size variation between buildings. */
  sizeChaos:  number;
  /** Probability that a terminal polygon becomes an empty lot instead of a building. */
  emptyProb:  number;
}

// Pre-tuned configs matching the source ward types.
// Scale: TownGeneratorOS used ~200-unit cities; we use 800x600 (≈4× bigger),
// so minSq is scaled up by ~16×.
export const WARD_CONFIGS: Record<string, WardConfig> = {
  // Very small, chaotic, dense — lots of tiny buildings crammed together
  slum: { minSq: 200,  gridChaos: 0.8, sizeChaos: 0.8, emptyProb: 0.03 },
  // Moderate size, semi-regular — tradespeople and craftsmen
  craftsmen: { minSq: 350,  gridChaos: 0.55, sizeChaos: 0.6,  emptyProb: 0.04 },
  // Larger buildings, less chaotic, some empty lots
  patriciate: { minSq: 700,  gridChaos: 0.55, sizeChaos: 0.8,  emptyProb: 0.20 },
  // Central plaza / market — very large, very sparse
  market: { minSq: 1800, gridChaos: 0.3,  sizeChaos: 0.5,  emptyProb: 0.40 },
};

// ── ALLEY width (gap inserted at each recursive cut) ─────────────────────────
// TownGeneratorOS ALLEY = 0.6 in their coords; we scale up to match our SVG space.
const ALLEY_GAP = 3.5;

// ── Core recursive subdivision ───────────────────────────────────────────────

/**
 * Recursively subdivide `poly` into building footprints using the
 * TownGeneratorOS createAlleys algorithm.
 *
 * @param poly   Polygon (after ward inset) to fill with buildings.
 * @param cfg    Ward parameters controlling density/chaos/size.
 * @param rng    Seeded PRNG for deterministic output.
 * @param depth  Guard against infinite recursion.
 */
export function createAlleyBuildings(
  poly: Pt[],
  cfg: WardConfig,
  rng: () => number,
  depth = 0
): Pt[][] {
  if (poly.length < 3 || depth > 14) return [];

  const area = polyArea(poly);

  // Terminal size with random variance (sizeChaos controls spread)
  const exponent = 4 * cfg.sizeChaos * (rng() - 0.5);
  const terminalSq = cfg.minSq * Math.pow(2, exponent);

  if (area < terminalSq) {
    // This piece is small enough to be a single building
    if (rng() > cfg.emptyProb) return [poly];
    return [];
  }

  // Find the longest edge — we bisect from its start vertex
  let longestLen = -1;
  let longestIdx = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > longestLen) { longestLen = d; longestIdx = i; }
  }

  const vertex = poly[longestIdx];
  const next   = poly[(longestIdx + 1) % poly.length];

  // Position along the edge (ratio ≈ 0.5 ± 0.4*chaos)
  const spread = 0.8 * cfg.gridChaos;
  const ratio  = (1 - spread) / 2 + rng() * spread;

  // Angle perturbation (0° for orderly, ±30° for chaotic)
  // Only apply angle chaos when polygon is large enough to matter
  const angleRange = (Math.PI / 6) * cfg.gridChaos * (area < cfg.minSq * 4 ? 0 : 1);
  const angle = (rng() - 0.5) * angleRange;

  // Compute cut point on the longest edge + perpendicular cut direction
  const cutPt = interpolatePt(vertex, next, ratio);
  const edgeDir = norm(sub(next, vertex));
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // Rotate edge direction by angle
  const rotated = { x: edgeDir.x * cos - edgeDir.y * sin, y: edgeDir.y * cos + edgeDir.x * sin };
  // Perpendicular to rotated direction = the cut line direction
  const cutDir = perp(rotated);
  const cutP2  = add(cutPt, scale(cutDir, longestLen * 2));

  // Should we split (add ALLEY gap) or just divide?
  // TownGeneratorOS: split when area > minSq / (rng * rng)
  const doSplit = area > cfg.minSq / (Math.max(rng() * rng(), 0.01));
  const gap = doSplit ? ALLEY_GAP : 0;

  const halves = cutPolygon(poly, cutPt, cutP2, gap);
  if (!halves) return [poly.length < 4 ? poly : poly]; // fallback: keep whole block

  const buildings: Pt[][] = [];
  for (const half of halves) {
    if (half.length < 3) continue;
    buildings.push(...createAlleyBuildings(half, cfg, rng, depth + 1));
  }
  return buildings;
}

// ── Ward config selector by terrain type + density ───────────────────────────

export function wardConfigForCell(
  terrain: string,
  density: number
): WardConfig {
  if (terrain === "market") return WARD_CONFIGS.market;

  // Pick base config by density (high density → slum-like, low → patriciate)
  let base: WardConfig;
  if (density > 0.72) {
    base = WARD_CONFIGS.slum;
  } else if (density > 0.45) {
    base = WARD_CONFIGS.craftsmen;
  } else {
    base = WARD_CONFIGS.patriciate;
  }

  // Scale minSq inversely with density so denser cells get smaller buildings
  return {
    ...base,
    minSq: base.minSq * (1 + (1 - density) * 0.6),
  };
}
