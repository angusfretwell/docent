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

    // A window that loses focus mid-hold (alt-/cmd-tab) never sees the keyup, so
    // the held state would stick until the next press. Clear it whenever focus
    // or visibility is lost — the key can't remain "pressed" from here.
    function handleReset() {
      setKeyPressed(false);
    }

    window.addEventListener("keydown", handleKeyDown, { passive: true });
    window.addEventListener("keyup", handleKeyUp, { passive: true });
    window.addEventListener("blur", handleReset);
    document.addEventListener("visibilitychange", handleReset);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleReset);
      document.removeEventListener("visibilitychange", handleReset);
    };
  }, [targetKey]);

  return keyPressed;
}
