import { Header } from "../organisms/Header";
import { MeshView } from "../organisms/MeshView";
import { EditToolbar, EditPanel } from "../organisms/EditPanel";
import { ZonePanel } from "../organisms/ZonePanel";
import { useMap } from "../../contexts/MapContext";

export const Home = () => {
  const { state, dispatch } = useMap();
  const { editMode, selected } = state;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <EditToolbar />

      <div className="flex flex-1 overflow-hidden">
        {/* Map canvas */}
        <main className="flex flex-1 flex-col items-center px-4 py-6">
          <div className="mb-4 flex w-full max-w-4xl items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-800">City Maker</h2>
            <button
              onClick={() => dispatch({ type: "TOGGLE_EDIT" })}
              className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
                editMode
                  ? "bg-amber-700 text-white hover:bg-amber-800"
                  : "border border-amber-700 text-amber-700 hover:bg-amber-50"
              }`}
            >
              {editMode ? "Exit Edit Mode" : "Edit Map"}
            </button>
          </div>
          <MeshView />
          {!editMode && (
            <p className="mt-3 text-sm text-gray-400">
              Click "Edit Map" to reshape the city
            </p>
          )}
        </main>

        {/* Properties / zone panel (slides in when editing) */}
        {editMode && (
          <aside className="w-64 shrink-0 overflow-y-auto border-l border-gray-200 bg-white shadow-inner">
            {state.tool === "paint" ? (
              <>
                <div className="border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Paint Zones
                </div>
                <ZonePanel />
              </>
            ) : (
              <>
                <div className="border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Properties
                </div>
                <EditPanel />
                {selected && (
                  <div className="border-t border-gray-100 px-4 py-3">
                    <button
                      onClick={() => dispatch({ type: "SELECT", sel: null })}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Clear selection
                    </button>
                  </div>
                )}
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};
