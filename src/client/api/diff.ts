import { Change } from "@shared/schemas/change";
import { Schema } from "effect";

import { client } from "./client";

const decodeChange = Schema.decodeUnknownSync(Change);

export async function get(signal?: AbortSignal): Promise<Change> {
  const body = await client.get("diff", { signal }).json();
  return decodeChange(body);
}
