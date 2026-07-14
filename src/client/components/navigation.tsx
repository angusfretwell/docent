import { useKeyPressed } from "@client/hooks/use-key-pressed";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Code2, GitCompare, Pointer } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";

import { Kbd } from "./ui/kbd";
import { Tabs, TabsList, TabsTab } from "./ui/tabs";

export function Navigation() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });

  const navigate = useNavigate();

  useHotkeys("Alt+1", () => {
    navigate({ to: "/" });
  });

  useHotkeys("Alt+2", () => {
    navigate({ to: "/code" });
  });

  useHotkeys("Alt+3", () => {
    navigate({ to: "/product" });
  });

  const isAltPressed = useKeyPressed("Alt");

  return (
    <Tabs value={pathname}>
      <TabsList>
        <TabsTab
          nativeButton={false}
          value="/"
          render={<Link to="/" />}
          className="w-8"
        >
          {isAltPressed ? <Kbd>1</Kbd> : <GitCompare />}
        </TabsTab>
        <TabsTab
          className="w-8"
          nativeButton={false}
          value="/code"
          render={<Link to="/code" />}
        >
          {isAltPressed ? <Kbd>2</Kbd> : <Code2 />}
        </TabsTab>
        <TabsTab
          className="w-8"
          nativeButton={false}
          value="/product"
          render={<Link to="/product" />}
        >
          {isAltPressed ? <Kbd>3</Kbd> : <Pointer />}
        </TabsTab>
      </TabsList>
    </Tabs>
  );
}
