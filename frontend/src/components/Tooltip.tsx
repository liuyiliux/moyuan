import { useState, useEffect, useRef, type ReactNode } from "react";

export interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  position?: "top" | "bottom" | "left" | "right";
}

export function Tooltip({ children, content, position = "top" }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const childRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        childRef.current && 
        !childRef.current.contains(event.target as Node) &&
        tooltipRef.current && 
        !tooltipRef.current.contains(event.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const positionStyles = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const arrowStyles = {
    top: "top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-bg-card",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-bg-card",
    left: "left-full top-1/2 -translate-y-1/2 border-8 border-transparent border-l-bg-card",
    right: "right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-bg-card",
  };

  return (
    <div 
      ref={childRef}
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <>
          <div
            ref={tooltipRef}
            className={`absolute z-50 px-3 py-1.5 bg-bg-card border border-border-default rounded-md text-sm whitespace-nowrap shadow-lg ${positionStyles[position]}`}
          >
            {content}
          </div>
          <div className={`absolute z-50 w-0 h-0 ${arrowStyles[position]}`} />
        </>
      )}
    </div>
  );
}

export default Tooltip;
