import { useState } from "react";

/**
 * A localStorage-backed preference, so layout/order survive reloads. `decode`
 * validates the stored raw string, falling back to `initial` for anything
 * absent or no longer a valid `T`.
 */
export function usePersisted<T extends string>(
  key: string,
  initial: T,
  decode: (raw: string) => T | undefined
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = globalThis.localStorage?.getItem(key);
    return (
      (raw === null || raw === undefined ? undefined : decode(raw)) ?? initial
    );
  });
  function set(next: T) {
    setValue(next);
    globalThis.localStorage?.setItem(key, next);
  }
  return [value, set];
}
