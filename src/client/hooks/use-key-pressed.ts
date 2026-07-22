import { useEffect, useState } from "react";

export function useKeyPressed(targetKey: string) {
  const [keyPressed, setKeyPressed] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === targetKey) {
        setKeyPressed(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === targetKey) {
        setKeyPressed(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown, { passive: true });
    window.addEventListener("keyup", handleKeyUp, { passive: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [targetKey]);

  return keyPressed;
}
