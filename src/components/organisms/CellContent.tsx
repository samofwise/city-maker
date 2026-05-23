/**
 * Renders interior content for each terrain type:
 *   city / market → building footprints via recursive alley subdivision
 *   forest / park  → scattered tree canopy circles
 *   farm           → crop field lines
 *   water          → elliptical ripples
 */
import { useMemo } from "react";
import { computeCellInset, type VertexId } from "../../lib/mesh";
import { centroid, pointInPolygon, toSvgPoints, type Pt } from "../../lib/geometry";
import { createAlleyBuildings, wardConfigForCell } from "../../lib/buildingGen";
import { PALETTE, type CellData, type EdgeData, type VertexData } from "../../lib/terrain";
import type { Cell, Mesh } from "../../lib/mesh";

type CityMesh = Mesh<VertexData, EdgeData, CellData>;

// ── Per-cell seeded PRNG ──────────────────────────────────────────────────────

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

// ── Bounding box ──────────────────────────────────────────────────────────────

function bbox(pts: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// ── Non-building content generators ──────────────────────────────────────────

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
  const angle = (rng() * 60 - 30) * (Math.PI / 180);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const lines: Array<[number, number, number, number]> = [];
  for (let d = -span / 2; d < span / 2; d += 7) {
    const px = cx - sin * d, py = cy + cos * d;
    lines.push([px - cos * span / 2, py - sin * span / 2, px + cos * span / 2, py + sin * span / 2]);
  }
  return lines;
}

function waterRipples(clipPts: Pt[], seed: string) {
  const rng = cellRng(seed + "w");
  const bb  = bbox(clipPts);
  const cen = centroid(clipPts);
  return Array.from({ length: 3 + Math.floor(rng() * 3) }, () => ({
    x:  cen.x + (rng() - 0.5) * (bb.maxX - bb.minX) * 0.5,
    y:  cen.y + (rng() - 0.5) * (bb.maxY - bb.minY) * 0.5,
    rx: 8 + rng() * 14,
    ry: 0,
  })).map((r) => ({ ...r, ry: r.rx * (0.3 + cellRng(seed + r.x)()*0.25) }));
}

// ── Component ──────────────────────────────────────────────────────────────────

interface CellContentProps {
  cell: Cell<CellData>;
  mesh: CityMesh;
}

export const CellContent = ({ cell, mesh }: CellContentProps) => {
  const terrain = cell.data.terrain;
  const density = cell.data.density;

  // Stable key for memoisation — recompute only when vertex positions change
  const vertexKey = cell.vertexIds.map((id: VertexId) => {
    const v = mesh.vertices.get(id);
    return v ? `${v.x.toFixed(1)},${v.y.toFixed(1)}` : "";
  }).join("|");

  const clipPts = useMemo(
    () => computeCellInset(cell, mesh),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cell.id, vertexKey, terrain, density]
  );

  // ── Building footprints (city / market) ─────────────────────────────────
  const buildingPolygons = useMemo(() => {
    if (terrain !== "city" && terrain !== "market") return null;
    if (clipPts.length < 3) return null;
    const cfg = wardConfigForCell(terrain, density);
    const rng = cellRng(cell.id + "bld");
    return createAlleyBuildings(clipPts, cfg, rng);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.id, vertexKey, terrain, density]);

  // ── Other terrain content ────────────────────────────────────────────────
  const otherContent = useMemo(() => {
    if (clipPts.length < 3) return null;
    if (terrain === "forest" || terrain === "park") return treeDots(clipPts, density, cell.id);
    if (terrain === "farm")  return cropLines(clipPts, cell.id);
    if (terrain === "water") return waterRipples(clipPts, cell.id);
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.id, vertexKey, terrain, density]);

  if (clipPts.length < 3) return null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Buildings — two-pass render: thick dark outline first, then light fill */}
      {buildingPolygons && buildingPolygons.length > 0 && (
        <g>
          {/* Pass 1: outlines */}
          {buildingPolygons.map((bPts, i) => (
            <polygon
              key={`bo-${cell.id}-${i}`}
              points={toSvgPoints(bPts)}
              fill={PALETTE.cityDark}
              stroke={PALETTE.wallStroke}
              strokeWidth={0.5}
            />
          ))}
          {/* Pass 2: light fill on top (slightly inset visual) */}
          {buildingPolygons.map((bPts, i) => (
            <polygon
              key={`bf-${cell.id}-${i}`}
              points={toSvgPoints(bPts)}
              fill={terrain === "market" ? PALETTE.marketDark : PALETTE.city}
              stroke="none"
              strokeWidth={0}
            />
          ))}
        </g>
      )}

      {/* Forest / park: tree canopies */}
      {(terrain === "forest" || terrain === "park") && otherContent &&
        (otherContent as ReturnType<typeof treeDots>).map((t, i) => (
          <circle
            key={`tr-${cell.id}-${i}`}
            cx={t.x} cy={t.y} r={t.r}
            fill={terrain === "park" ? PALETTE.parkDark : PALETTE.forestDark}
            opacity={0.78}
          />
        ))}

      {/* Farm: crop lines */}
      {terrain === "farm" && otherContent &&
        (otherContent as ReturnType<typeof cropLines>).map(([x1, y1, x2, y2], i) => (
          <line
            key={`cr-${cell.id}-${i}`}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={PALETTE.farmDark} strokeWidth={0.8} opacity={0.55}
          />
        ))}

      {/* Water: ripples */}
      {terrain === "water" && otherContent &&
        (otherContent as ReturnType<typeof waterRipples>).map((r, i) => (
          <ellipse
            key={`rp-${cell.id}-${i}`}
            cx={r.x} cy={r.y} rx={r.rx} ry={r.ry}
            fill="none" stroke={PALETTE.waterDark} strokeWidth={0.8} opacity={0.4}
          />
        ))}
    </>
  );
};
