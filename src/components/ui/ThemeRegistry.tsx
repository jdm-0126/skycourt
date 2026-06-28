"use client";

/**
 * ThemeRegistry — wires the Material UI theme into the React tree.
 *
 * Supports light/dark mode driven by:
 *   1. The `data-color-scheme` attribute on <html> (set server-side or by JS)
 *   2. A `themeMode` prop passed from a server component reading system_settings
 *   3. Client-side override stored in localStorage key `sky-court-theme`
 */

import * as React from "react";
import { useServerInsertedHTML } from "next/navigation";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import baseTheme from "./theme";

function createEmotionCache() {
  return createCache({ key: "mui-style", prepend: true });
}

interface ThemeRegistryProps {
  children: React.ReactNode;
  /** Initial theme mode from system_settings (server-rendered). */
  initialMode?: "light" | "dark";
}

export default function ThemeRegistry({ children, initialMode = "light" }: ThemeRegistryProps) {
  const [{ cache, flush }] = React.useState(() => {
    const cache = createEmotionCache();
    cache.compat = true;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const prevInsert = cache.insert;
    let inserted: string[] = [];
    cache.insert = (...args) => {
      const serialized = args[1];
      if (cache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }
      return prevInsert(...args);
    };
    const flush = () => {
      const prevInserted = inserted;
      inserted = [];
      return prevInserted;
    };
    return { cache, flush };
  });

  // Resolve active mode: localStorage override > server setting
  const [mode, setMode] = React.useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("sky-court-theme") as "light" | "dark" | null;
      if (stored === "light" || stored === "dark") return stored;
    }
    return initialMode;
  });

  // Expose a setter on the window so AdminSettingsClient can toggle without
  // a full page reload. Also update localStorage and dispatch a custom event.
  React.useEffect(() => {
    const handler = (e: Event) => {
      const newMode = (e as CustomEvent<"light" | "dark">).detail;
      setMode(newMode);
      localStorage.setItem("sky-court-theme", newMode);
    };
    window.addEventListener("sky-court-theme-change", handler);
    return () => window.removeEventListener("sky-court-theme-change", handler);
  }, []);

  const activeTheme = React.useMemo(
    () =>
      createTheme({
        ...baseTheme,
        palette: {
          ...baseTheme.palette,
          mode,
          ...(mode === "dark"
            ? {
                background: { default: "#121212", paper: "#1e1e1e" },
                text: { primary: "#e8e8e8", secondary: "#aaaaaa" },
              }
            : {
                background: { default: "#f9fafb", paper: "#ffffff" },
                text: { primary: "#1a1a1a", secondary: "#4a4a4a" },
              }),
        },
      }),
    [mode]
  );

  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) return null;
    let styles = "";
    for (const name of names) {
      styles += cache.inserted[name];
    }
    return (
      <style
        key={cache.key}
        data-emotion={`${cache.key} ${names.join(" ")}`}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={activeTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}
