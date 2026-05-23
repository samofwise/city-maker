import { useState } from "react";
import { useMap } from "../../contexts/MapContext";
import { PALETTE, type ZoneType, type TerrainType } from "../../lib/terrain";

const ZONE_TYPE_OPTIONS: { value: ZoneType; label: string; terrain: TerrainType; color: string }[] = [
  { value: "ocean",    label: "Ocean",       terrain: "water",  color: PALETTE.water     },
  { value: "lake",     label: "Lake",        terrain: "water",  color: PALETTE.waterDark },
  { value: "forest",   label: "Forest",      terrain: "forest", color: PALETTE.forest    },
  { value: "farmland", label: "Farmland",    terrain: "farm",   color: PALETTE.farm      },
  { value: "city",     label: "City District", terrain: "city", color: PALETTE.city      },
];

const ZONE_TYPE_ICON: Record<ZoneType, string> = {
  ocean:    "〜",
  lake:     "◎",
  forest:   "♣",
  farmland: "≡",
  city:     "▦",
};

export const ZonePanel = () => {
  const { state, dispatch } = useMap();
  const { city: { zones, mesh }, activeZoneId, paintMode } = state;
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneType, setNewZoneType] = useState<ZoneType>("city");
  const [creating, setCreating] = useState(false);

  const zoneList = [...zones.values()].sort((a, b) => a.name.localeCompare(b.name));

  const handleCreate = () => {
    if (!newZoneName.trim()) return;
    const typeInfo = ZONE_TYPE_OPTIONS.find((t) => t.value === newZoneType)!;
    dispatch({
      type: "CREATE_ZONE",
      name: newZoneName.trim(),
      zoneType: newZoneType,
      terrain: typeInfo.terrain,
      density: newZoneType === "city" ? 0.6 : 0.4,
    });
    setNewZoneName("");
    setCreating(false);
  };

  const activeZone = activeZoneId ? zones.get(activeZoneId) : null;

  return (
    <div className="flex h-full flex-col gap-0">
      {/* Paint mode toggle */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => dispatch({ type: "SET_PAINT_MODE", mode: "add" })}
            className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
              paintMode === "add"
                ? "bg-amber-700 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Add cells
          </button>
          <button
            onClick={() => dispatch({ type: "SET_PAINT_MODE", mode: "remove" })}
            className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
              paintMode === "remove"
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Remove cells
          </button>
        </div>
      </div>

      {/* Active zone info */}
      {activeZone && (
        <div
          className="mx-3 mt-3 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: PALETTE.farmDark, background: PALETTE.paperDark }}
        >
          <div className="flex items-center gap-1.5 font-semibold text-gray-800">
            <span>{ZONE_TYPE_ICON[activeZone.type]}</span>
            <span>{activeZone.name}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {activeZone.cellIds.size} cell{activeZone.cellIds.size !== 1 ? "s" : ""}
            {paintMode === "add"
              ? " — click/drag cells to add"
              : " — click/drag cells to remove"}
          </div>
        </div>
      )}

      {!activeZone && (
        <div className="px-4 py-3 text-xs text-gray-400">
          Select a zone below to start painting
        </div>
      )}

      {/* Zone list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Zones
        </div>
        <div className="flex flex-col gap-1">
          {zoneList.map((zone) => {
            const typeInfo = ZONE_TYPE_OPTIONS.find((t) => t.value === zone.type);
            const isActive = zone.id === activeZoneId;
            return (
              <div
                key={zone.id}
                className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                  isActive ? "bg-amber-100 ring-1 ring-amber-400" : "hover:bg-gray-100"
                }`}
                onClick={() =>
                  dispatch({
                    type: "SET_ACTIVE_ZONE",
                    zoneId: isActive ? null : zone.id,
                  })
                }
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-sm border border-gray-300"
                  style={{ background: typeInfo?.color ?? PALETTE.empty }}
                />
                <span className="flex-1 truncate text-sm text-gray-800">{zone.name}</span>
                <span className="text-xs text-gray-400">{zone.cellIds.size}</span>
                <button
                  className="ml-1 hidden text-xs text-gray-400 hover:text-red-500 group-hover:block"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "DELETE_ZONE", zoneId: zone.id });
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Zone density editing when active zone selected */}
      {activeZone && (
        <div className="border-t border-gray-100 px-4 py-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-gray-500">
              Zone density&nbsp;
              <span className="font-mono text-gray-700">
                {Math.round(activeZone.density * 100)}%
              </span>
            </span>
            <input
              type="range" min="0" max="100" step="5"
              value={Math.round(activeZone.density * 100)}
              onChange={(e) =>
                dispatch({
                  type: "UPDATE_ZONE",
                  zoneId: activeZoneId!,
                  patch: { density: Number(e.target.value) / 100 },
                })
              }
              className="accent-amber-700"
            />
          </label>

          {activeZone.type === "city" && (
            <label className="mt-2 flex flex-col gap-1 text-xs">
              <span className="text-gray-500">District name</span>
              <input
                type="text"
                value={activeZone.name}
                onChange={(e) =>
                  dispatch({
                    type: "UPDATE_ZONE",
                    zoneId: activeZoneId!,
                    patch: { name: e.target.value },
                  })
                }
                className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-800 focus:border-amber-500 focus:outline-none"
              />
            </label>
          )}
        </div>
      )}

      {/* Create new zone */}
      <div className="border-t border-gray-100 px-3 py-3">
        {creating ? (
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              type="text"
              placeholder="Zone name…"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
              className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none"
            />
            <select
              value={newZoneType}
              onChange={(e) => setNewZoneType(e.target.value as ZoneType)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              {ZONE_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newZoneName.trim()}
                className="flex-1 rounded bg-amber-700 py-1 text-xs font-medium text-white disabled:opacity-40 hover:bg-amber-800"
              >
                Create
              </button>
              <button
                onClick={() => setCreating(false)}
                className="flex-1 rounded bg-gray-100 py-1 text-xs text-gray-600 hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full rounded border border-dashed border-gray-300 py-1.5 text-xs text-gray-500 hover:border-amber-400 hover:text-amber-700"
          >
            + New zone
          </button>
        )}
      </div>
    </div>
  );
};
