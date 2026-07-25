import darkTheme from "@pierre/theme/pierre-dark-soft";
import lightTheme from "@pierre/theme/pierre-light";

import { useMediaQuery } from "./use-media-query";

type ColorScheme = "dark" | "light";

export function useColorScheme(): ColorScheme {
  return useMediaQuery("(prefers-color-scheme: dark)") ? "dark" : "light";
}

export function useCodeTheme() {
  const theme = useColorScheme();

  return theme === "light" ? lightTheme : darkTheme;
}

export function useCodeThemeColor(color: string) {
  const theme = useCodeTheme();

  return theme.colors?.[color];
}
