import { useRef, useState, useCallback, useEffect } from "react";
import { X, ZoomIn, ZoomOut, RotateCw, Maximize2 } from "lucide-react";

interface ImageViewerProps {
  src: string;
  alt?: string;
  onClose?: () => void;
}

export default function ImageViewer({ src, alt = "preview", onClose }: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  const zoomIn = () => setScale(s => Math.min(s * 1.3, 5));
  const zoomOut = () => setScale(s => Math.max(s / 1.3, 0.2));
  const reset = () => { setScale(1); setRotation(0); setPosition({ x: 0, y: 0 }); };

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      setScale(s => Math.max(0.2, Math.min(5, s - e.deltaY * 0.002)));
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, px: position.x, py: position.y };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setPosition({
      x: dragStart.current.px + (e.clientX - dragStart.current.x),
      y: dragStart.current.py + (e.clientY - dragStart.current.y),
    });
  };
  const onPointerUp = () => setDragging(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/60 shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={zoomOut} title="缩小" className="p-2 text-[var(--text-inverse)]/80 hover:text-[var(--text-inverse)] hover:bg-[var(--bg-card)]/10 rounded-lg">
            <ZoomOut className="w-5 h-5" />
          </button>
          <span className="text-xs text-[var(--text-inverse)]/60 min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} title="放大" className="p-2 text-[var(--text-inverse)]/80 hover:text-[var(--text-inverse)] hover:bg-[var(--bg-card)]/10 rounded-lg">
            <ZoomIn className="w-5 h-5" />
          </button>
          <button onClick={() => setRotation(r => r + 90)} title="旋转" className="p-2 text-[var(--text-inverse)]/80 hover:text-[var(--text-inverse)] hover:bg-[var(--bg-card)]/10 rounded-lg">
            <RotateCw className="w-5 h-5" />
          </button>
          <button onClick={reset} title="重置" className="px-2 py-1 text-xs text-[var(--text-inverse)]/60 hover:text-[var(--text-inverse)]">重置</button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleFullscreen} title="全屏" className="p-2 text-[var(--text-inverse)]/80 hover:text-[var(--text-inverse)] hover:bg-[var(--bg-card)]/10 rounded-lg">
            <Maximize2 className="w-5 h-5" />
          </button>
          {onClose && (
            <button onClick={onClose} title="关闭" className="p-2 text-[var(--text-inverse)]/80 hover:text-[var(--text-inverse)] hover:bg-[var(--bg-card)]/10 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Image area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transformOrigin: "center center",
            transition: dragging ? "none" : "transform 0.15s ease",
            maxWidth: "none",
            position: "absolute",
            top: "50%",
            left: "50%",
            translate: "-50% -50%",
          }}
          className="select-none"
        />
      </div>
    </div>
  );
}
