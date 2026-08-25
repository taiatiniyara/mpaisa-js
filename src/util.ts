import type { FetchLike } from "./http.js";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const defaultFetch: FetchLike = (input, init) =>
  fetch(input as Parameters<FetchLike>[0], init);
