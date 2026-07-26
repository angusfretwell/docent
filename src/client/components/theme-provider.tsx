import { useMediaQuery } from "@client/hooks/use-media-query";
import darkTheme from "@pierre/theme/pierre-dark-soft";
import lightTheme from "@pierre/theme/pierre-light";
import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";

type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  disableTransitionOnChange?: boolean;
}

interface ThemeProviderState {
  resolvedTheme: ResolvedTheme;
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
const THEME_VALUES = new Set<Theme>(["dark", "light", "system"]);

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined);

function isTheme(value: string | null): value is Theme {
  if (value === null) {
    return false;
  }

  return THEME_VALUES.has(value as Theme);
}

function getSystemTheme(): ResolvedTheme {
  if (window.matchMedia(COLOR_SCHEME_QUERY).matches) {
    return "dark";
  }

  return "light";
}

function getNextTheme(currentTheme: Theme): Theme {
  if (currentTheme === "dark") {
    return "light";
  }

  if (currentTheme === "light") {
    return "dark";
  }

  return getSystemTheme() === "dark" ? "light" : "dark";
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style");
  style.append(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}"
    )
  );
  document.head.append(style);

  return () => {
    window.getComputedStyle(document.body);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove();
      });
    });
  };
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  // oxlint-disable-next-line react/hook-use-state
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const storedTheme = localStorage.getItem(storageKey);
    if (isTheme(storedTheme)) {
      return storedTheme;
    }

    return defaultTheme;
  });

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      localStorage.setItem(storageKey, nextTheme);
      setThemeState(nextTheme);
    },
    [storageKey]
  );

  const systemTheme: ResolvedTheme = useMediaQuery(COLOR_SCHEME_QUERY)
    ? "dark"
    : "light";

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  React.useEffect(() => {
    const root = document.documentElement;
    const restoreTransitions = disableTransitionOnChange
      ? disableTransitionsTemporarily()
      : null;

    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);

    if (restoreTransitions) {
      restoreTransitions();
    }
  }, [resolvedTheme, disableTransitionOnChange]);

  useHotkeys("Alt+D", () => {
    setThemeState((currentTheme) => {
      const nextTheme = getNextTheme(currentTheme);

      localStorage.setItem(storageKey, nextTheme);
      return nextTheme;
    });
  });

  React.useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.storageArea !== localStorage) {
        return;
      }

      if (event.key !== storageKey) {
        return;
      }

      if (isTheme(event.newValue)) {
        setThemeState(event.newValue);
        return;
      }

      setThemeState(defaultTheme);
    }

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [defaultTheme, storageKey]);

  const value = React.useMemo(
    () => ({
      resolvedTheme,
      setTheme,
      theme,
    }),
    [resolvedTheme, theme, setTheme]
  );

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}

export function useResolvedTheme() {
  return useTheme().resolvedTheme;
}

export function useCodeTheme() {
  const colorScheme = useResolvedTheme();

  return colorScheme === "light" ? lightTheme : darkTheme;
}

export function useCodeThemeColor(color: string) {
  const theme = useCodeTheme();

  return theme.colors?.[color];
}
