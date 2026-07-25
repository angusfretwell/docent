import { Button } from "@client/components/ui/button";
import { Moon, Sun } from "lucide-react";

import { useResolvedTheme, useTheme } from "./theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme } = useTheme();
  const resolvedTheme = useResolvedTheme();

  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <Button
      aria-label={`Switch to ${nextTheme} theme`}
      className={className}
      onClick={() => setTheme(nextTheme)}
      size="icon"
      variant="ghost"
    >
      {resolvedTheme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
