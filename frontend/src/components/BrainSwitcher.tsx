import { useState, useEffect, useRef } from "react";
import { Brain, ChevronDown, Plus, Settings, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useBrain } from "../lib/brain-context";
import { brainApi, type Brain as BrainType } from "../api/brains";
import { brainSwitcherCopy, useCopy } from "../lib/copywriting";

export default function BrainSwitcher() {
  const b = useCopy(brainSwitcherCopy);
  const { currentBrain, setCurrentBrain } = useBrain();
  const [brains, setBrains] = useState<BrainType[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadBrains();
  }, []);

  useEffect(() => {
    const handleBrainsUpdated = () => {
      void loadBrains();
    };
    window.addEventListener("brains-updated", handleBrainsUpdated);
    return () => window.removeEventListener("brains-updated", handleBrainsUpdated);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function loadBrains() {
    setIsLoading(true);
    try {
      const data = await brainApi.list(false);
      setBrains(data);
    } catch (error) {
      console.error("Failed to load brains:", error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSelect(brain: BrainType) {
    setCurrentBrain(brain);
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent("brain-changed", { detail: { brainId: brain.id } }));
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-[13px] text-[var(--text-muted)]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] dao-brain-trigger"
      >
        <span className={`relative ${currentBrain?.icon ? "" : "text-jade"}`}>
          {currentBrain?.icon ? (
            <span className="text-base">{currentBrain.icon}</span>
          ) : (
            <Brain className="w-4 h-4" />
          )}
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-jade rounded-full animate-pulse opacity-70" />
        </span>
        <span className="max-w-[100px] truncate">
          {currentBrain?.name || b.select}
        </span>
        <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 bg-[var(--bg-card)] rounded-xl py-2 z-50 border border-[var(--border-subtle)] shadow-lg dao-dropdown-enter">
          <div className="max-h-60 overflow-y-auto px-2">
            {brains.length === 0 && (
              <div className="px-3 py-6 text-center text-[13px] text-[var(--text-muted)]">
                {b.empty}
              </div>
            )}
            {brains.map((brain) => (
              <button
                key={brain.id}
                onClick={() => handleSelect(brain)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-[13px] transition-all rounded-lg mb-0.5 ${
                  brain.id === currentBrain?.id
                    ? "bg-[var(--jade)]/10 text-[var(--jade)] shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                }`}
              >
                {brain.icon ? (
                  <span className="text-base">{brain.icon}</span>
                ) : (
                  <Brain className="w-4 h-4 text-[var(--text-muted)]" />
                )}
                <div className="flex-1 text-left">
                  <div className="font-medium truncate">{brain.name}</div>
                  {brain.description && (
                    <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                      {brain.description}
                    </div>
                  )}
                </div>
                {brain.is_default && (
                  <span className="dao-badge text-[10px] px-1.5 py-0.5">
                    丹
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="border-t border-[var(--border-subtle)] mt-2 pt-2 px-2">
            <Link
              to="/brains"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors rounded-lg"
            >
              <Settings className="w-3.5 h-3.5" />
              {b.manage}
            </Link>
            <Link
              to="/brains?create=true"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--jade)] hover:bg-[var(--jade)]/10 transition-colors rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              {b.create}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
