import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

export function resolveTheme(pref: Theme): "light" | "dark" {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyThemeAttr(resolved: "light" | "dark") {
  document.documentElement.dataset.theme = resolved;
}

function readStored(): Theme {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window === "undefined" ? "system" : readStored()
  );

  useEffect(() => {
    applyThemeAttr(resolveTheme(theme));

    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyThemeAttr(resolveTheme("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const set = useCallback((t: Theme) => {
    setTheme(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  return [theme, set];
}