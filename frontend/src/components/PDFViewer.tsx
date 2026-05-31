import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Download, Loader2,
} from "lucide-react";

import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  src: string;      // /api/contents/{id}/preview?mode=raw 或 /files/...
  filename?: string;
}

export default function PDFViewer({ src, filename }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNum(1);
    setLoading(false);
  };

  const goPrev = () => setPageNum(p => Math.max(1, p - 1));
  const goNext = () => setPageNum(p => Math.min(numPages, p + 1));
  const zoomIn  = () => setScale(s => Math.min(s * 1.25, 3));
  const zoomOut = () => setScale(s => Math.max(s / 1.25, 0.3));

  // 键盘翻页
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowUp")   goPrev();
    if (e.key === "ArrowRight" || e.key === "ArrowDown") goNext();
  }, [goPrev, goNext]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-secondary)] dark:bg-[var(--bg-card)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-card)] dark:bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] dark:border-[var(--border-subtle)] shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={goPrev} disabled={pageNum <= 1} title="上一页" className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-muted)] min-w-[4rem] text-center">
            {pageNum} / {numPages || "-"}
          </span>
          <button onClick={goNext} disabled={pageNum >= numPages} title="下一页" className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={zoomOut} title="缩小" className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)]">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-[var(--text-muted)] min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} title="放大" className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)]">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => setRotation(r => r + 90)} title="旋转" className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)]">
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {filename && (
          <a
            href={src}
            download={filename}
            className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] rounded-lg"
          >
            <Download className="w-3.5 h-3.5" />
            下载
          </a>
        )}
      </div>

      {/* PDF canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex justify-center p-4"
      >
        {loading && (
          <div className="flex items-center gap-2 text-[var(--text-muted)] py-20">
            <Loader2 className="w-5 h-5 animate-spin" />
            加载 PDF 中...
          </div>
        )}
        <Document
          file={src}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={(e) => console.error("PDF load error:", e)}
          className=""
          loading=""
        >
          <Page
            pageNumber={pageNum}
            scale={scale}
            rotate={rotation}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="shadow-[var(--shadow-lg)]"
          />
        </Document>
      </div>
    </div>
  );
}
