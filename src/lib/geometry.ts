// ── 2D geometry primitives used by rendering and generation ───────────────────

export interface Pt { x: number; y: number }

export const sub  = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const add  = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (p: Pt, s: number): Pt => ({ x: p.x * s, y: p.y * s });
export const len  = (p: Pt) => Math.sqrt(p.x * p.x + p.y * p.y);
export const norm = (p: Pt): Pt => { const l = len(p) || 1; return { x: p.x / l, y: p.y / l }; };
export const dot  = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
export const perp = (p: Pt): Pt => ({ x: -p.y, y: p.x }); // 90° CCW

/** Signed area (positive = CCW winding). */
export function signedArea(pts: Pt[]): number {
  let s = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    s += (a.x * b.y - b.x * a.y);
  }
  return s / 2;
}

/** Centroid of a polygon. */
export function centroid(pts: Pt[]): Pt {
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; }
  return { x: sx / pts.length, y: sy / pts.length };
}

/**
 * Line–line intersection of two infinite lines defined by two points each.
 * Returns null if lines are parallel.
 */
export function lineIntersect(
  a1: Pt, a2: Pt, // line A through a1→a2
  b1: Pt, b2: Pt  // line B through b1→b2
): Pt | null {
  const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  return { x: a1.x + t * dx1, y: a1.y + t * dy1 };
}

/**
 * Inset a polygon by a per-edge distance array.
 * `insets[i]` is the inset for edge (pts[i] → pts[i+1]).
 * Positive = inward (toward centroid side).
 *
 * Returns the inset polygon (may degenerate for very large insets).
 */
export function insetPolygon(pts: Pt[], insets: number[]): Pt[] {
  const n = pts.length;
  if (n < 3) return pts;

  // Ensure CCW winding so "inward" direction is consistent
  const cw = signedArea(pts) < 0;

  // For each edge, compute the offset edge (parallel, shifted inward)
  const offsetEdges: Array<[Pt, Pt]> = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const d   = norm(sub(b, a));
    const inw = cw ? { x: d.y, y: -d.x } : { x: -d.y, y: d.x }; // inward normal
    const shift = scale(inw, insets[i]);
    offsetEdges.push([add(a, shift), add(b, shift)]);
  }

  // New vertices = intersection of consecutive offset edges
  const result: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const [a1, a2] = offsetEdges[(i + n - 1) % n];
    const [b1, b2] = offsetEdges[i];
    const p = lineIntersect(a1, a2, b1, b2);
    result.push(p ?? b1); // fallback to edge start if parallel
  }

  return result;
}

/** Absolute area of a polygon. */
export function polyArea(pts: Pt[]): number {
  return Math.abs(signedArea(pts));
}

/** Interpolate between two points at ratio t ∈ [0,1]. */
export function interpolatePt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Cut a convex-ish polygon along the infinite line through p1→p2.
 * Returns [half1, half2] or null if the line doesn't cross the polygon.
 * `gap` is the alley half-width: the cut edge of each half is moved inward
 * by gap/2 perpendicular to the cut line, creating street clearance.
 */
export function cutPolygon(
  pts: Pt[],
  p1: Pt,
  p2: Pt,
  gap = 0
): [Pt[], Pt[]] | null {
  const n = pts.length;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;

  // Find all intersections of the cut line with polygon edges
  const hits: Array<{ edgeIdx: number; s: number; pt: Pt }> = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const ex = b.x - a.x, ey = b.y - a.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-10) continue;
    const t = ((a.x - p1.x) * ey - (a.y - p1.y) * ex) / denom;
    const s = ((a.x - p1.x) * dy  - (a.y - p1.y) * dx)  / denom;
    if (s >= -1e-8 && s <= 1 + 1e-8) {
      hits.push({ edgeIdx: i, s: t, pt: { x: p1.x + t * dx, y: p1.y + t * dy } });
    }
  }

  if (hits.length < 2) return null;
  // Take the two extreme hits if more than 2 (degenerate polygons)
  hits.sort((a, b) => a.edgeIdx - b.edgeIdx || a.s - b.s);
  const h1 = hits[0], h2 = hits[hits.length - 1];
  if (h1.edgeIdx === h2.edgeIdx) return null;

  const I1 = h1.pt, I2 = h2.pt;
  const e1 = h1.edgeIdx, e2 = h2.edgeIdx;

  // Build half1: I1 → pts[e1+1..e2] → I2
  const half1: Pt[] = [I1];
  for (let i = e1 + 1; i <= e2; i++) half1.push({ ...pts[i] });
  half1.push(I2);

  // Build half2: I2 → pts[e2+1..n+e1] → I1
  const half2: Pt[] = [I2];
  for (let i = e2 + 1; i <= e2 + (n - e2 + e1); i++) half2.push({ ...pts[i % n] });
  half2.push(I1);

  if (half1.length < 3 || half2.length < 3) return null;

  if (gap > 0) {
    applyAlleyGap(half1, I1, I2, gap / 2);
    applyAlleyGap(half2, I2, I1, gap / 2);
  }

  return [half1, half2];
}

/**
 * Moves the two intersection points that form the "cut edge" inward by `d`,
 * perpendicular to the cut direction — creating alley clearance.
 */
function applyAlleyGap(pts: Pt[], cutA: Pt, cutB: Pt, d: number): void {
  const cen = centroid(pts);
  const cutDir  = norm(sub(cutB, cutA));
  const cutPerp = perp(cutDir);
  const mid     = interpolatePt(cutA, cutB, 0.5);
  const toCen   = sub(cen, mid);
  const sign    = dot(toCen, cutPerp) >= 0 ? 1 : -1;
  const shift   = scale(cutPerp, sign * d);

  for (const p of pts) {
    if (Math.hypot(p.x - cutA.x, p.y - cutA.y) < 1e-4 ||
        Math.hypot(p.x - cutB.x, p.y - cutB.y) < 1e-4) {
      p.x += shift.x;
      p.y += shift.y;
    }
  }
}

export function toSvgPoints(pts: Pt[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(" ");
}

/** Distance from point p to segment (a→b). */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const t  = Math.max(0, Math.min(1, dot(ap, ab) / (dot(ab, ab) || 1)));
  const cx = a.x + t * ab.x;
  const cy = a.y + t * ab.y;
  return Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
}

/** Whether point p is inside polygon pts (ray-casting). */
export function pointInPolygon(p: Pt, pts: Pt[]): boolean {
  let inside = false;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
