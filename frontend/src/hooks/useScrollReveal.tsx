import { useEffect, useRef, useState, type ReactNode } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
}

export function useScrollReveal() {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      function(entryList) {
        const entry = entryList[0];
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(element);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    observer.observe(element);

    return function() { observer.disconnect(); };
  }, []);

  return { ref, isVisible };
}

export function ScrollReveal(props: ScrollRevealProps) {
  const { ref, isVisible } = useScrollReveal();
  const cls = isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4";
  return (
    <div ref={ref} className={"transition-all duration-500 ease-out " + cls + " " + (props.className || "")}>
      {props.children}
    </div>
  );
}