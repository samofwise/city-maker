import { Brush, MousePointer2, Pencil, Spline, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useEditing } from "../../contexts/EditingContext";
import type { CityMap } from "../../types/CityMap";
import { IconButton } from "../atoms/IconButton";
import { EditPanel } from "./EditPanel";
import { ZonePanel } from "./ZonePanel";

interface ToolbarProps {
  city: CityMap;
  setCity: Dispatch<SetStateAction<CityMap | null>>;
}

export const Toolbar = ({ city, setCity }: ToolbarProps) => {
  const { isEditing, currentTool, setEditing } = useEditing();

  const panel = !isEditing ? null : currentTool === "select" ? (
    <EditPanel city={city} setCity={setCity} />
  ) : currentTool === "paint" ? (
    <ZonePanel city={city} setCity={setCity} />
  ) : null;

  return (
    <div className="fixed top-4 left-4 z-10">
      <div className="flex items-center gap-2">
        {!isEditing ? (
          <IconButton
            icon={Pencil}
            aria-label="Edit map"
            onClick={() => setEditing(true)}
          />
        ) : (
          <>
            <IconButton
              icon={MousePointer2}
              variant={currentTool === "select" ? "primary" : "secondary"}
              aria-label="Edit elements"
              onClick={() => setEditing("select")}
            />
            <IconButton
              icon={Brush}
              variant={currentTool === "paint" ? "primary" : "secondary"}
              aria-label="Edit zones"
              onClick={() => setEditing("paint")}
            />
            <IconButton
              icon={Spline}
              variant={currentTool === "vertex" ? "primary" : "secondary"}
              aria-label="Edit vertices"
              onClick={() => setEditing("vertex")}
            />
            <div className="mx-1 h-6 w-px bg-gray-200" />
            <IconButton
              icon={X}
              variant="ghost"
              size="small"
              aria-label="Exit edit mode"
              onClick={() => setEditing(false)}
            />
          </>
        )}
      </div>

      {panel && (
        <div className="absolute top-full left-0 mt-2 w-64 overflow-hidden rounded-lg bg-white shadow-lg">
          {panel}
        </div>
      )}
    </div>
  );
};
