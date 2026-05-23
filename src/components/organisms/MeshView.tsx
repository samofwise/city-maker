import { useMemo, useRef, useState, type PointerEvent } from "react";
import {
  meshFromPoints,
  moveVertex,
  type Mesh,
  type VertexId,
} from "../../lib/mesh";

const WIDTH = 800;
const HEIGHT = 600;
const SITE_COUNT = 24;
const BOUNDS: [number, number, number, number] = [0, 0, WIDTH, HEIGHT];

const createInitialMesh = (): Mesh => {
  const rng = mulberry32(1337);
  const sites = Array.from({ length: SITE_COUNT }, () => ({
    x: rng() * WIDTH,
    y: rng() * HEIGHT,
  }));
  return meshFromPoints(sites, BOUNDS, {
    vertex: {},
    edge: {},
    cell: {},
  });
};

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const MeshView = () => {
  const [mesh, setMesh] = useState<Mesh>(createInitialMesh);
  const [dragging, setDragging] = useState<VertexId | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const cellColors = useMemo(() => {
    const colors = new Map<string, string>();
    const rng = mulberry32(42);
    for (const c of mesh.cells.values()) {
      const hue = Math.floor(rng() * 360);
      colors.set(c.id, `hsl(${hue}, 70%, 88%)`);
    }
    return colors;
  }, [mesh]);

  const toSvgPoint = (e: PointerEvent<SVGElement>): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * HEIGHT;
    return {
      x: Math.max(0, Math.min(WIDTH, x)),
      y: Math.max(0, Math.min(HEIGHT, y)),
    };
  };

  const onPointerDown =
    (id: VertexId) => (e: PointerEvent<SVGCircleElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(id);
    };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const { x, y } = toSvgPoint(e);
    moveVertex(mesh, dragging, x, y);
    setMesh({ ...mesh });
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (dragging) {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      setDragging(null);
    }
  };

  const v = (id: VertexId) => mesh.vertices.get(id)!;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full max-w-4xl touch-none rounded border border-gray-200 bg-white"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {[...mesh.cells.values()].map((c) => (
        <polygon
          key={c.id}
          points={c.vertexIds.map((id) => `${v(id).x},${v(id).y}`).join(" ")}
          fill={cellColors.get(c.id)}
          stroke="none"
        />
      ))}
      {[...mesh.edges.values()].map((e) => {
        const a = v(e.a);
        const b = v(e.b);
        return (
          <line
            key={e.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#475569"
            strokeWidth={1.5}
          />
        );
      })}
      {[...mesh.vertices.values()].map((vx) => (
        <circle
          key={vx.id}
          cx={vx.x}
          cy={vx.y}
          r={7}
          fill={dragging === vx.id ? "#dc2626" : "#1f2937"}
          stroke="white"
          strokeWidth={2}
          className="cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown(vx.id)}
        />
      ))}
    </svg>
  );
};
