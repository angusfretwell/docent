import { useEffect, useState } from "react";

export function useKeyPressed(targetKey: string) {
  const [keyPressed, setKeyPressed] = useState(false);

  useEffect(() => {
    function downHandler({ key }: { key: string }) {
      if (key === targetKey) {
        setKeyPressed(true);
      }
    }

    function upHandler({ key }: { key: string }) {
      if (key === targetKey) {
        setKeyPressed(false);
      }
    }

    window.addEventListener("keydown", downHandler);
    window.addEventListener("keyup", upHandler);

    return () => {
      window.removeEventListener("keydown", downHandler);
      window.removeEventListener("keyup", upHandler);
    };
  }, [targetKey]);

  return keyPressed;
}
