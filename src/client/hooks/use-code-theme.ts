import { useTheme } from "@client/components/theme-provider";
import darkTheme from "@pierre/theme/pierre-dark-soft";
import lightTheme from "@pierre/theme/pierre-light";

export function useCodeTheme() {
  const { theme } = useTheme();

  return theme === "light" ? lightTheme : darkTheme;
}

export function useCodeThemeColor(color: string) {
  const theme = useCodeTheme();

  return theme.colors?.[color];
}
