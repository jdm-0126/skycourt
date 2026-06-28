"use client";

/**
 * ThemeRegistry — wires the Material UI green theme into the React tree.
 *
 * Must be a Client Component because MUI's emotion-based styling requires
 * access to the browser's style injection APIs. Wrap the root layout with
 * this component to apply the Sky Court theme to every page.
 *
 * The `useServerInsertedHTML` hook flushes emotion styles on the server so
 * there is no flash of unstyled content on first load with Next.js App Router.
 */

import * as React from "react";
import { useServerInsertedHTML } from "next/navigation";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import theme from "./theme";

// Create the emotion cache once, outside the component.
// The `prepend: true` option ensures MUI styles are injected before any
// other styles so they can be overridden without specificity fights.
function createEmotionCache() {
  return createCache({ key: "mui-style", prepend: true });
}

interface ThemeRegistryProps {
  children: React.ReactNode;
}

export default function ThemeRegistry({ children }: ThemeRegistryProps) {
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
      <ThemeProvider theme={theme}>
        {/* CssBaseline resets browser defaults and applies MUI background colour */}
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}
