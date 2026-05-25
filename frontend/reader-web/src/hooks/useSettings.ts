import { useEffect, useState } from "react";

export function useSettings() {
  const [theme, setTheme] = useState<"light" | "dark" | "sepia">(() => {
    return (
      (localStorage.getItem("theme") as
        | "light"
        | "dark"
        | "sepia") || "light"
    );
  });

  const [fontSize, setFontSize] = useState<number>(() => {
    return Number(localStorage.getItem("fontSize")) || 1.05;
  });

  const [lineSpacing, setLineSpacing] = useState<number>(() => {
    return Number(localStorage.getItem("lineSpacing")) || 1.75;
  });

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("fontSize", fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem("lineSpacing", lineSpacing.toString());
  }, [lineSpacing]);

  return {
    theme,
    setTheme,

    fontSize,
    setFontSize,

    lineSpacing,
    setLineSpacing,
  };
}
