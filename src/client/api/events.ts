import { backend } from "./backend";

export function subscribe(onReviewChanged: () => void): () => void {
  return backend.subscribe(onReviewChanged);
}
