import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getCurrentBrainId, setCurrentBrainId, brainApi, type Brain } from "../api/brains";

interface BrainContextType {
  currentBrainId: string | null;
  currentBrain: Brain | null;
  setCurrentBrain: (brain: Brain) => void;
  refreshBrains: () => Promise<void>;
}

const BrainContext = createContext<BrainContextType | undefined>(undefined);

export function useBrain() {
  const context = useContext(BrainContext);
  if (!context) {
    throw new Error("useBrain must be used within a BrainProvider");
  }
  return context;
}

export function BrainProvider({ children }: { children: ReactNode }) {
  const [currentBrainId, setCurrentBrainIdState] = useState<string | null>(getCurrentBrainId());
  const [currentBrain, setCurrentBrainState] = useState<Brain | null>(null);

  const refreshBrains = useCallback(async () => {
    try {
      const data = await brainApi.list(false);
      
      const found = data.find((b) => b.id === currentBrainId);
      if (found) {
        setCurrentBrainState(found);
      } else if (data.length > 0) {
        setCurrentBrainState(data[0]);
        setCurrentBrainIdState(data[0].id);
        setCurrentBrainId(data[0].id);
      }
    } catch (error) {
      console.error("Failed to load brains:", error);
    }
  }, [currentBrainId]);

  useEffect(() => {
    refreshBrains();
  }, [refreshBrains]);

  const setCurrentBrain = (brain: Brain) => {
    setCurrentBrainState(brain);
    setCurrentBrainIdState(brain.id);
    setCurrentBrainId(brain.id);
  };

  return (
    <BrainContext.Provider value={{ currentBrainId, currentBrain, setCurrentBrain, refreshBrains }}>
      {children}
    </BrainContext.Provider>
  );
}