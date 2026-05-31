import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [isAnimating, setIsAnimating] = useState(false);
  const [key, setKey] = useState(location.key);

  useEffect(() => {
    setIsAnimating(true);
    const timer = setTimeout(() => {
      setKey(location.key);
      setIsAnimating(false);
    }, 150);

    return () => clearTimeout(timer);
  }, [location.key]);

  return (
    <div className="relative">
      <div
        key={key}
        className={`transition-all duration-300 ease-in-out ${
          isAnimating ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
