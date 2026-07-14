import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** The last segment of a repo-relative path. */
export function basename(path: string): string {
  const slash = path.lastIndexOf("/");

  return slash === -1 ? path : path.slice(slash + 1);
}
