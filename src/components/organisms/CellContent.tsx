/**
 * Renders the interior content of a cell based on its terrain type:
 *   city/market → building footprints
 *   forest/park  → tree canopy circles
 *   farm         → crop field lines
 *   water        → subtle wave ripples
 *   empty        → nothing
 *
 * All content is clipped to the cell's inset polygon.
 */
import { useMemo } from "react";
import { computeCellInset, type VertexId } from "../../lib/mesh";
import {
  centroid,
  pointInPolygon,
  toSvgPoints,
  type Pt,
} from "../../lib/geometry";
import { PALETTE, type CellData, type EdgeData, type VertexData } from "../../lib/terrain";
import type { Cell, Mesh } from "../../lib/mesh";

type CityMesh = Mesh<VertexData, EdgeData, CellData>;

// ── Tiny seeded PRNG per cell ──────────────────────────────────────────────────

function cellRng(seed: string) {
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

// ── Bounding box ───────────────────────────────────────────────────────────────

function bbox(pts: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// ── Content generators ─────────────────────────────────────────────────────────

function buildingRects(clipPts: Pt[], density: number, seed: string) {
  const rng = cellRng(seed + "b");
  const bb  = bbox(clipPts);
  const cen = centroid(clipPts);
  const step = 10 + (1 - density) * 8;
  const rects: Array<{ x: number; y: number; w: number; h: number; angle: number }> = [];

  for (let gy = bb.minY; gy < bb.maxY; gy += step) {
    for (let gx = bb.minX; gx < bb.maxX; gx += step) {
      if (rng() > density * 0.85) continue;
      const cx = gx + rng() * step * 0.6;
      const cy = gy + rng() * step * 0.6;
      if (!pointInPolygon({ x: cx, y: cy }, clipPts)) continue;
      const w = 3.5 + rng() * 3.5;
      const h = 3.5 + rng() * 3.5;
      // Align roughly to the centroid direction for a more organic layout
      const angle = Math.atan2(cy - cen.y, cx - cen.x) * (180 / Math.PI);
      rects.push({ x: cx, y: cy, w, h, angle: Math.round(angle / 15) * 15 });
    }
  }
  return rects;
}

function treeDots(clipPts: Pt[], density: number, seed: string) {
  const rng = cellRng(seed + "t");
  const bb  = bbox(clipPts);
  const count = Math.round(density * 30 + 8);
  const dots: Array<{ x: number; y: number; r: number }> = [];

  for (let i = 0; i < count * 6 && dots.length < count; i++) {
    const x = bb.minX + rng() * (bb.maxX - bb.minX);
    const y = bb.minY + rng() * (bb.maxY - bb.minY);
    if (!pointInPolygon({ x, y }, clipPts)) continue;
    dots.push({ x, y, r: 2.5 + rng() * 2.5 });
  }
  return dots;
}

function cropLines(clipPts: Pt[], seed: string) {
  const rng  = cellRng(seed + "c");
  const bb   = bbox(clipPts);
  const span = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 1.5;
  const cx   = (bb.minX + bb.maxX) / 2;
  const cy   = (bb.minY + bb.maxY) / 2;
  const angle = (rng() * 60 - 30) * (Math.PI / 180); // -30…+30 degrees
  const cos   = Math.cos(angle), sin = Math.sin(angle);
  const lines: Array<[number, number, number, number]> = [];
  const spacing = 7;

  for (let d = -span / 2; d < span / 2; d += spacing) {
    // Line perpendicular to the crop direction passing through (cx + d*perp)
    const px = cx - sin * d, py = cy + cos * d;
    const x1 = px - cos * span / 2, y1 = py - sin * span / 2;
    const x2 = px + cos * span / 2, y2 = py + sin * span / 2;
    lines.push([x1, y1, x2, y2]);
  }
  return lines;
}

function waterRipples(clipPts: Pt[], seed: string) {
  const rng = cellRng(seed + "w");
  const bb  = bbox(clipPts);
  const cen = centroid(clipPts);
  const count = 3 + Math.floor(rng() * 3);
  const ripples: Array<{ x: number; y: number; rx: number; ry: number }> = [];

  for (let i = 0; i < count; i++) {
    const x  = cen.x + (rng() - 0.5) * (bb.maxX - bb.minX) * 0.5;
    const y  = cen.y + (rng() - 0.5) * (bb.maxY - bb.minY) * 0.5;
    const rx = 8 + rng() * 14;
    ripples.push({ x, y, rx, ry: rx * (0.3 + rng() * 0.25) });
  }
  return ripples;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface CellContentProps {
  cell: Cell<CellData>;
  mesh: CityMesh;
}

export const CellContent = ({ cell, mesh }: CellContentProps) => {
  const terrain = cell.data.terrain;
  const density = cell.data.density;
  const clipId  = `clip-${cell.id}`;

  const clipPts = useMemo(
    () => computeCellInset(cell, mesh),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cell.id, cell.vertexIds.map((id: VertexId) => {
      const v = mesh.vertices.get(id);
      return v ? `${v.x},${v.y}` : "";
    }).join("|"), cell.data.terrain, cell.data.density]
  );

  const content = useMemo(() => {
    if (clipPts.length < 3) return null;

    if (terrain === "city" || terrain === "market") {
      return buildingRects(clipPts, density, cell.id);
    }
    if (terrain === "forest" || terrain === "park") {
      return treeDots(clipPts, density, cell.id);
    }
    if (terrain === "farm") {
      return cropLines(clipPts, cell.id);
    }
    if (terrain === "water") {
      return waterRipples(clipPts, cell.id);
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipPts, terrain, density, cell.id]);

  if (!content || clipPts.length < 3) return null;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <polygon points={toSvgPoints(clipPts)} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* City / market: building footprints */}
        {(terrain === "city" || terrain === "market") &&
          Array.isArray(content) &&
          (content as ReturnType<typeof buildingRects>).map((r, i) => (
            <rect
              key={i}
              x={r.x - r.w / 2}
              y={r.y - r.h / 2}
              width={r.w}
              height={r.h}
              fill={PALETTE.cityDark}
              stroke={PALETTE.wallStroke}
              strokeWidth={0.3}
              transform={`rotate(${r.angle},${r.x},${r.y})`}
            />
          ))}

        {/* Forest / park: tree canopies */}
        {(terrain === "forest" || terrain === "park") &&
          Array.isArray(content) &&
          (content as ReturnType<typeof treeDots>).map((t, i) => (
            <circle
              key={i}
              cx={t.x}
              cy={t.y}
              r={t.r}
              fill={terrain === "park" ? PALETTE.parkDark : PALETTE.forestDark}
              opacity={0.75}
            />
          ))}

        {/* Farm: crop lines */}
        {terrain === "farm" &&
          Array.isArray(content) &&
          (content as ReturnType<typeof cropLines>).map(([x1, y1, x2, y2], i) => (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={PALETTE.farmDark}
              strokeWidth={0.8}
              opacity={0.55}
            />
          ))}

        {/* Water: ripple ellipses */}
        {terrain === "water" &&
          Array.isArray(content) &&
          (content as ReturnType<typeof waterRipples>).map((r, i) => (
            <ellipse
              key={i}
              cx={r.x} cy={r.y}
              rx={r.rx} ry={r.ry}
              fill="none"
              stroke={PALETTE.waterDark}
              strokeWidth={0.8}
              opacity={0.4}
            />
          ))}
      </g>
    </g>
  );
};
