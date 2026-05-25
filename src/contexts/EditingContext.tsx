import type { EditingTool } from "~/types/EditingTool";
import { createContext, useContext, useState, type ReactNode } from "react";

interface EditingContextType {
  isEditing: boolean;
  currentTool: EditingTool;
  setEditing: (value: boolean | EditingTool) => void;
}

const DEFAULT_EDITING_TOOL: EditingTool = "select";

const EditingContext = createContext<EditingContextType | null>(null);

export const EditingProvider = ({ children }: { children: ReactNode }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentTool, setCurrentTool] =
    useState<EditingTool>(DEFAULT_EDITING_TOOL);

  const setEditing = (value: boolean | EditingTool) => {
    if (typeof value === "boolean") {
      setIsEditing(value);
      return;
    }
    if (!isEditing) {
      throw new Error(
        `Cannot select tool "${value}" while editing is off — call setEditing(true) first.`
      );
    }
    setCurrentTool(value);
  };

  return (
    <EditingContext.Provider value={{ isEditing, currentTool, setEditing }}>
      {children}
    </EditingContext.Provider>
  );
};

export const useEditing = () => {
  const context = useContext(EditingContext);
  if (!context)
    throw new Error("useEditing must be used inside EditingProvider");
  return context;
};
