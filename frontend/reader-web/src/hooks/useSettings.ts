import { useEffect, useRef, useState } from "react";
import {
  getSetting,
  saveSetting,
  type ReaderTheme,
} from "../storage/indexedDb";

export function useSettings() {
  const settingsReady = useRef(false);
  const [theme, setTheme] = useState<ReaderTheme>(() => {
    return (
      (localStorage.getItem("theme") as
        | ReaderTheme) || "light"
    );
  });

  const [fontSize, setFontSize] = useState<number>(() => {
    return Number(localStorage.getItem("fontSize")) || 1.05;
  });

  const [lineSpacing, setLineSpacing] = useState<number>(() => {
    return Number(localStorage.getItem("lineSpacing")) || 1.75;
  });
  const initialSettings = useRef({
    theme,
    fontSize,
    lineSpacing,
  });

  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      const [
        savedTheme,
        savedFontSize,
        savedLineSpacing,
      ] = await Promise.all([
        getSetting<ReaderTheme>("theme", initialSettings.current.theme),
        getSetting("fontSize", initialSettings.current.fontSize),
        getSetting("lineSpacing", initialSettings.current.lineSpacing),
      ]);

      if (!mounted) return;

      setTheme(savedTheme);
      setFontSize(savedFontSize);
      setLineSpacing(savedLineSpacing);
      settingsReady.current = true;
    };

    loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!settingsReady.current) return;

    saveSetting("theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!settingsReady.current) return;

    saveSetting("fontSize", fontSize);
    localStorage.setItem("fontSize", fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    if (!settingsReady.current) return;

    saveSetting("lineSpacing", lineSpacing);
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
