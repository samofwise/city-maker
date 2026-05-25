/** Shared helpers used by individual cell renderers. */
import { pointInPolygon, type Pt } from "../../../lib/geometry";

// Per-cell seeded PRNG (FNV-1a + xorshift)
export function cellRng(seed: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  }
  h = h >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 13), 0xbf58476d) >>> 0;
    h = Math.imul(h ^ (h >>> 31), 0x94d049bb) >>> 0;
    h = (h ^ (h >>> 27)) >>> 0;
    return h / 4294967296;
  };
}

export function bbox(pts: Pt[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export interface CellRenderProps {
  clipPts: Pt[];
  seed: string;
  density: number;
}

/**
 * Clip a line segment a→b against a (possibly non-convex) simple polygon.
 * Returns the sub-segments that lie inside the polygon.
 */
export function clipSegmentToPolygon(a: Pt, b: Pt, poly: Pt[]): [Pt, Pt][] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ts = [0, 1];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p1 = poly[i]!;
    const p2 = poly[(i + 1) % n]!;
    const ex = p2.x - p1.x, ey = p2.y - p1.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-10) continue;
    const t = ((p1.x - a.x) * ey - (p1.y - a.y) * ex) / denom;
    const u = ((p1.x - a.x) * dy - (p1.y - a.y) * dx) / denom;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);

  const out: [Pt, Pt][] = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i]!, t1 = ts[i + 1]!;
    if (t1 - t0 < 1e-6) continue;
    const mt = (t0 + t1) / 2;
    if (!pointInPolygon({ x: a.x + mt * dx, y: a.y + mt * dy }, poly)) continue;
    out.push([
      { x: a.x + t0 * dx, y: a.y + t0 * dy },
      { x: a.x + t1 * dx, y: a.y + t1 * dy },
    ]);
  }
  return out;
}
