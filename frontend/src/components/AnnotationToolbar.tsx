import { useEffect, useRef, useState } from "react";
import { MessageSquare, X, Check } from "lucide-react";

interface AnnotationToolbarProps {
  containerSelector: string;
  onSave: (data: {
    selected_text: string;
    start_offset: number;
    end_offset: number;
    annotation_text: string;
  }) => void;
}

export default function AnnotationToolbar({
  containerSelector,
  onSave,
}: AnnotationToolbarProps) {
  const [showToolbar, setShowToolbar] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [annotationText, setAnnotationText] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedText, setSelectedText] = useState("");
  const [startOffset, setStartOffset] = useState(0);
  const [endOffset, setEndOffset] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    function handleMouseUp() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setShowToolbar(false);
        setShowInput(false);
        return;
      }

      const range = selection.getRangeAt(0);
      if (!container!.contains(range.commonAncestorContainer)) {
        setShowToolbar(false);
        setShowInput(false);
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        setShowToolbar(false);
        setShowInput(false);
        return;
      }

      // Calculate offsets relative to container text
      const containerText = container!.textContent || "";
      const start = containerText.indexOf(text);
      if (start === -1) {
        setShowToolbar(false);
        setShowInput(false);
        return;
      }

      const rect = range.getBoundingClientRect();
      const containerRect = container!.getBoundingClientRect();

      setPosition({
        top: rect.top - containerRect.top - 50,
        left: rect.left - containerRect.left + rect.width / 2,
      });
      setSelectedText(text);
      setStartOffset(start);
      setEndOffset(start + text.length);
      setShowToolbar(true);
      setShowInput(false);
      setAnnotationText("");
    }

    container.addEventListener("mouseup", handleMouseUp);
    return () => container.removeEventListener("mouseup", handleMouseUp);
  }, [containerSelector]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        toolbarRef.current &&
        !toolbarRef.current.contains(e.target as Node)
      ) {
        setShowToolbar(false);
        setShowInput(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  function handleSave() {
    if (!annotationText.trim()) return;
    onSave({
      selected_text: selectedText,
      start_offset: startOffset,
      end_offset: endOffset,
      annotation_text: annotationText.trim(),
    });
    setShowToolbar(false);
    setShowInput(false);
    setAnnotationText("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setShowToolbar(false);
      setShowInput(false);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  }

  if (!showToolbar) return null;

  return (
    <div
      ref={toolbarRef}
      className="absolute z-50 -translate-x-1/2"
      style={{ top: position.top, left: position.left }}
    >
      {!showInput ? (
        <div className="flex items-center gap-1 bg-[var(--bg-card)] dark:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-lg shadow-[var(--shadow-lg)] px-2 py-1.5">
          <button
            onClick={() => setShowInput(true)}
            className="flex items-center gap-1.5 px-2 py-1 text-sm text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] dark:hover:bg-[var(--bg-elevated)] rounded-md transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            添加批注
          </button>
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] dark:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] dark:border-[var(--border-subtle)] rounded-lg shadow-[var(--shadow-lg)] p-2 w-64">
          <textarea
            ref={inputRef}
            value={annotationText}
            onChange={(e) => setAnnotationText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入批注内容..."
            className="taste-input w-full h-20 resize-none"
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              onClick={() => {
                setShowToolbar(false);
                setShowInput(false);
              }}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] dark:hover:bg-[var(--bg-elevated)] rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={handleSave}
              disabled={!annotationText.trim()}
              className="p-1.5 text-[var(--accent-text)] hover:text-[var(--accent-hover)] dark:text-[var(--accent-text)] dark:hover:text-[var(--accent-text)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-soft)] rounded-md transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
