import { useMap } from "../../contexts/MapContext";
import {
  PALETTE,
  type TerrainType,
  type EdgeFeature,
  type VertexFeature,
} from "../../lib/terrain";

const TERRAIN_OPTIONS: TerrainType[] = [
  "water", "farm", "forest", "city", "market", "park", "empty",
];

const EDGE_FEATURE_OPTIONS: EdgeFeature[] = ["none", "road", "river", "wall"];
const VERTEX_FEATURE_OPTIONS: VertexFeature[] = ["none", "gate", "bridge", "tower"];

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Panel ──────────────────────────────────────────────────────────────────────

export const EditPanel = () => {
  const { state, dispatch } = useMap();
  const { selected, city: { mesh, zones } } = state;

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Click an element to edit it
      </div>
    );
  }

  // ── Cell panel ─────────────────────────────────────────────────────────────
  if (selected.type === "cell") {
    const cell = mesh.cells.get(selected.id as import("../../lib/mesh").CellId);
    if (!cell) return null;
    const d = cell.data;
    const zone = d.zoneId ? zones.get(d.zoneId) : undefined;

    return (
      <div className="flex flex-col gap-4 p-4">
        <h3 className="font-semibold text-gray-800">Cell</h3>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Terrain</span>
          <select
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            value={d.terrain}
            onChange={(e) =>
              dispatch({
                type: "UPDATE_CELL",
                id: cell.id,
                patch: { terrain: e.target.value as TerrainType },
              })
            }
          >
            {TERRAIN_OPTIONS.map((t) => (
              <option key={t} value={t}>{label(t)}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">
            Density&nbsp;
            <span className="font-mono text-gray-800">
              {Math.round(d.density * 100)}%
            </span>
          </span>
          <input
            type="range" min="0" max="100" step="5"
            value={Math.round(d.density * 100)}
            onChange={(e) =>
              dispatch({
                type: "UPDATE_CELL",
                id: cell.id,
                patch: { density: Number(e.target.value) / 100 },
              })
            }
            className="w-full accent-amber-700"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Within walls</span>
          <input
            type="checkbox"
            checked={d.withinWalls}
            onChange={(e) =>
              dispatch({
                type: "UPDATE_CELL",
                id: cell.id,
                patch: { withinWalls: e.target.checked },
              })
            }
            className="h-4 w-4 accent-amber-700"
          />
        </label>

        {zone && (
          <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Zone: <strong>{zone.name}</strong> ({label(zone.type)})
          </div>
        )}

        <div className="text-xs text-gray-400">ID: {cell.id}</div>
      </div>
    );
  }

  // ── Edge panel ─────────────────────────────────────────────────────────────
  if (selected.type === "edge") {
    const firstEdge = mesh.edges.get(selected.id as import("../../lib/mesh").EdgeId);
    if (!firstEdge) return null;
    const traceIds  = selected.traceIds ?? [selected.id as import("../../lib/mesh").EdgeId];
    const d         = firstEdge.data;
    const isFeature = d.feature !== "none";

    const updateAll = (patch: Partial<typeof d>) => {
      for (const eid of traceIds) {
        dispatch({ type: "UPDATE_EDGE", id: eid as import("../../lib/mesh").EdgeId, patch });
      }
    };

    return (
      <div className="flex flex-col gap-4 p-4">
        <h3 className="font-semibold text-gray-800">
          {isFeature ? label(d.feature) : "Edge"}&nbsp;
          <span className="text-xs font-normal text-gray-400">
            ({traceIds.length} segment{traceIds.length !== 1 ? "s" : ""})
          </span>
        </h3>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Feature type</span>
          <select
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            value={d.feature}
            onChange={(e) =>
              updateAll({ feature: e.target.value as EdgeFeature })
            }
          >
            {EDGE_FEATURE_OPTIONS.map((f) => (
              <option key={f} value={f}>{label(f)}</option>
            ))}
          </select>
        </label>

        {isFeature && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-600">
              Width&nbsp;
              <span className="font-mono text-gray-800">{d.width.toFixed(1)}</span>
            </span>
            <input
              type="range" min="1" max="20" step="0.5"
              value={d.width}
              onChange={(e) =>
                updateAll({ width: Number(e.target.value) })
              }
              className="w-full accent-amber-700"
            />
          </label>
        )}

        <div className="text-xs text-gray-400">
          {traceIds.map((id) => id).join(", ")}
        </div>
      </div>
    );
  }

  // ── Vertex panel ───────────────────────────────────────────────────────────
  if (selected.type === "vertex") {
    const vertex = mesh.vertices.get(selected.id as import("../../lib/mesh").VertexId);
    if (!vertex) return null;
    const d = vertex.data;

    return (
      <div className="flex flex-col gap-4 p-4">
        <h3 className="font-semibold text-gray-800">Vertex</h3>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Feature</span>
          <select
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            value={d.feature}
            onChange={(e) =>
              dispatch({
                type: "UPDATE_VERTEX",
                id: vertex.id,
                patch: { feature: e.target.value as VertexFeature },
              })
            }
          >
            {VERTEX_FEATURE_OPTIONS.map((f) => (
              <option key={f} value={f}>{label(f)}</option>
            ))}
          </select>
        </label>

        <div className="rounded bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600">
          ({vertex.x.toFixed(1)}, {vertex.y.toFixed(1)})
        </div>
        <div className="text-xs text-gray-400">ID: {vertex.id}</div>
      </div>
    );
  }

  return null;
};

// ── Edit toolbar ───────────────────────────────────────────────────────────────

export const EditToolbar = () => {
  const { state, dispatch } = useMap();
  const { editMode, tool } = state;

  const toolBtn = (t: import("../../lib/mapState").EditTool, label: string) => (
    <button
      key={t}
      onClick={() => dispatch({ type: "SET_TOOL", tool: t })}
      className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
        tool === t
          ? "bg-amber-700 text-white"
          : "bg-amber-100 text-amber-900 hover:bg-amber-200"
      }`}
    >
      {label}
    </button>
  );

  if (!editMode) return null;

  return (
    <div
      className="flex items-center gap-2 rounded-b border border-t-0 border-amber-300 bg-amber-50 px-4 py-2"
      style={{ borderColor: PALETTE.farmDark }}
    >
      <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
        Edit mode
      </span>
      {toolBtn("select", "Select")}
      {toolBtn("paint",  "Paint zones")}
      {toolBtn("vertex", "Move vertices")}
    </div>
  );
};
