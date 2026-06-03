import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type StyleTheme = "daoist" | "normal" | "anime";

interface StyleThemeContextType {
  styleTheme: StyleTheme;
  setStyleTheme: (t: StyleTheme) => void;
}

const StyleThemeContext = createContext<StyleThemeContextType | null>(null);

export function StyleThemeProvider({ children }: { children: ReactNode }) {
  const [styleTheme, setStyleThemeState] = useState<StyleTheme>(() => {
    return (localStorage.getItem("moyuan-style-theme") as StyleTheme) || "daoist";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-style-theme", styleTheme);
  }, [styleTheme]);

  const setStyleTheme = (t: StyleTheme) => {
    localStorage.setItem("moyuan-style-theme", t);
    setStyleThemeState(t);
  };

  return (
    <StyleThemeContext.Provider value={{ styleTheme, setStyleTheme }}>
      {children}
    </StyleThemeContext.Provider>
  );
}

export function useStyleTheme() {
  const ctx = useContext(StyleThemeContext);
  if (!ctx) throw new Error("useStyleTheme must be used within StyleThemeProvider");
  return ctx;
}
